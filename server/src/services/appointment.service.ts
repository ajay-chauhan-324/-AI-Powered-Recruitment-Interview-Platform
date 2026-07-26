import crypto from 'node:crypto'
import mongoose, { isValidObjectId } from 'mongoose'
import { AppointmentModel, type AppointmentDocument } from '../models/Appointment.model.js'
import { BookingLockModel } from '../models/BookingLock.model.js'
import { createAppointmentInputSchema, type CreateAppointmentInput } from '../validators/appointment.validators.js'
import { findNearestAlternatives, isSlotAvailable } from './availability.service.js'
import { AppointmentNotFoundError, BookingValidationError, SlotConflictError } from './booking.errors.js'
import { appointmentEvents } from '../events/appointmentEvents.js'

function toEventPayload(appointment: AppointmentDocument) {
  return {
    id: appointment._id.toString(),
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status as 'pending' | 'confirmed' | 'cancelled',
  }
}

/**
 * The booking authority (CLAUDE.md §11). Every booking path — public, AI,
 * admin, API — must call these functions; none of them may reimplement
 * conflict detection themselves. The database is the source of truth.
 */

export interface CreateAppointmentResult {
  appointment: AppointmentDocument
  /** Returned exactly once, at creation time. Only its hash is ever stored — see BookingLock.model.ts. */
  manageToken: string
}

export function generateManageToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex')
  return { raw, hash: hashManageToken(raw) }
}

export function hashManageToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/** Touches the shared BookingLock document as the first operation of a booking-mutation transaction —
 * see BookingLock.model.ts for why this is necessary for genuine concurrency safety. */
async function touchBookingLock(session: mongoose.ClientSession): Promise<void> {
  await BookingLockModel.updateOne({ singleton: 'default' }, { $inc: { version: 1 } }, { session, upsert: true })
}

async function withAlternativesOnConflict<T>(
  action: () => Promise<T>,
  onConflict: () => Promise<import('./availability.service.js').AvailableSlot[]>,
): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof SlotConflictError && error.alternatives.length === 0) {
      error.alternatives = await onConflict()
    }
    throw error
  }
}

export async function createAppointment(rawInput: CreateAppointmentInput): Promise<CreateAppointmentResult> {
  const input = createAppointmentInputSchema.parse(rawInput)
  const now = new Date()

  if (input.startAt.getTime() <= now.getTime()) {
    throw new BookingValidationError('Appointments cannot be booked in the past.')
  }

  const endAt = new Date(input.startAt.getTime() + input.durationMinutes * 60_000)

  // Fast pre-check outside any transaction: working hours, breaks, blocked periods, existing appointments.
  const preAvailable = await isSlotAvailable(input.startAt, input.durationMinutes, now)
  if (!preAvailable) {
    throw new SlotConflictError(
      await findNearestAlternatives({ preferredStart: input.startAt, durationMinutes: input.durationMinutes }, now),
    )
  }

  const { raw: manageToken, hash: manageTokenHash } = generateManageToken()

  const session = await mongoose.startSession()
  let created: AppointmentDocument | null = null

  try {
    await withAlternativesOnConflict(
      () =>
        session.withTransaction(async () => {
          await touchBookingLock(session)

          // Never trust the pre-check above as final authority — re-verify inside the transaction.
          const conflict = await AppointmentModel.findOne({
            status: { $in: ['pending', 'confirmed'] },
            startAt: { $lt: endAt },
            endAt: { $gt: input.startAt },
          }).session(session)

          if (conflict) {
            throw new SlotConflictError()
          }

          const [doc] = await AppointmentModel.create(
            [
              {
                name: input.name,
                email: input.email,
                purpose: input.purpose,
                startAt: input.startAt,
                endAt,
                durationMinutes: input.durationMinutes,
                timezone: input.timezone,
                status: 'confirmed',
                source: input.source,
                manageTokenHash,
              },
            ],
            { session },
          )
          created = doc ?? null
        }),
      () => findNearestAlternatives({ preferredStart: input.startAt, durationMinutes: input.durationMinutes }, now),
    )
  } finally {
    await session.endSession()
  }

  if (!created) {
    throw new Error('Appointment creation failed unexpectedly.')
  }

  appointmentEvents.emitAppointmentEvent('appointment.created', toEventPayload(created))

  return { appointment: created, manageToken }
}

/** newDurationMinutes lets admins change an appointment's length (CLAUDE.md §20 "Resize
 * duration") at the same time as moving it; omit it to keep the current duration — this is
 * the same reschedule path guest users hit via their manage link, just with one more field. */
export async function rescheduleAppointment(
  appointmentId: string,
  newStart: Date,
  newDurationMinutes?: number,
): Promise<AppointmentDocument> {
  if (!isValidObjectId(appointmentId)) throw new AppointmentNotFoundError()

  const now = new Date()
  if (newStart.getTime() <= now.getTime()) {
    throw new BookingValidationError('Cannot reschedule to a time in the past.')
  }
  if (newDurationMinutes !== undefined && newDurationMinutes <= 0) {
    throw new BookingValidationError('Duration must be positive.')
  }

  const session = await mongoose.startSession()
  let updated: AppointmentDocument | null = null
  let durationMinutes = 0

  try {
    await withAlternativesOnConflict(
      () =>
        session.withTransaction(async () => {
          await touchBookingLock(session)

          const existing = await AppointmentModel.findById(appointmentId).session(session)
          if (!existing || existing.status === 'cancelled') {
            throw new AppointmentNotFoundError()
          }
          durationMinutes = newDurationMinutes ?? existing.durationMinutes

          const newEnd = new Date(newStart.getTime() + durationMinutes * 60_000)

          // Excludes the appointment's own current (pre-move) row — otherwise a reschedule that
          // overlaps its own existing slot (e.g. moving 9:00-9:30 to 9:15-9:45) would look like a
          // conflict with itself.
          const conflict = await AppointmentModel.findOne({
            _id: { $ne: existing._id },
            status: { $in: ['pending', 'confirmed'] },
            startAt: { $lt: newEnd },
            endAt: { $gt: newStart },
          }).session(session)

          if (conflict) {
            throw new SlotConflictError()
          }

          existing.startAt = newStart
          existing.endAt = newEnd
          existing.durationMinutes = durationMinutes
          await existing.save({ session })
          updated = existing
        }),
      () =>
        findNearestAlternatives(
          { preferredStart: newStart, durationMinutes, excludeAppointmentId: appointmentId },
          now,
        ),
    )
  } finally {
    await session.endSession()
  }

  if (!updated) {
    throw new Error('Appointment reschedule failed unexpectedly.')
  }

  appointmentEvents.emitAppointmentEvent('appointment.updated', toEventPayload(updated))

  return updated
}

export async function cancelAppointment(appointmentId: string): Promise<AppointmentDocument> {
  if (!isValidObjectId(appointmentId)) throw new AppointmentNotFoundError()

  const existing = await AppointmentModel.findById(appointmentId)
  if (!existing || existing.status === 'cancelled') {
    throw new AppointmentNotFoundError()
  }

  existing.status = 'cancelled'
  await existing.save()

  appointmentEvents.emitAppointmentEvent('appointment.cancelled', toEventPayload(existing))

  return existing
}

export async function getAppointmentByToken(rawToken: string): Promise<AppointmentDocument | null> {
  return AppointmentModel.findOne({ manageTokenHash: hashManageToken(rawToken) })
}

export async function getAppointmentById(appointmentId: string): Promise<AppointmentDocument | null> {
  if (!isValidObjectId(appointmentId)) return null
  return AppointmentModel.findById(appointmentId)
}

/** Admin-only: full detail, including cancelled appointments (CLAUDE.md §8 "preserve
 * historical visibility") — never used by the anonymous public calendar view (Phase 5). */
export async function listAppointmentsInRange(from: Date, to: Date): Promise<AppointmentDocument[]> {
  return AppointmentModel.find({ startAt: { $lt: to }, endAt: { $gt: from } }).sort({ startAt: 1 })
}
