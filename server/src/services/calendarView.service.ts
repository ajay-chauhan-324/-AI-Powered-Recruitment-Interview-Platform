import { AppointmentModel } from '../models/Appointment.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import { BookingValidationError } from './booking.errors.js'

const MAX_QUERY_RANGE_DAYS = 62

/**
 * The PUBLIC-safe calendar read model. No authentication exists yet
 * (Phase 9 adds it), so this is the only calendar view any caller gets for
 * now — it deliberately excludes name/email/purpose. Cancelled appointments
 * are also excluded: they don't represent current busy time and historical
 * visibility is an admin concern (CLAUDE.md §8), not a public one. An
 * authenticated admin variant with full detail and history is Phase 9 work.
 */

export interface PublicCalendarAppointment {
  id: string
  startAt: Date
  endAt: Date
  status: 'pending' | 'confirmed'
}

export interface PublicCalendarBlock {
  id: string
  label: string
  startAt: Date
  endAt: Date
}

export interface PublicCalendarView {
  appointments: PublicCalendarAppointment[]
  blockedSlots: PublicCalendarBlock[]
}

export async function getPublicCalendarView(from: Date, to: Date): Promise<PublicCalendarView> {
  if (to.getTime() - from.getTime() > MAX_QUERY_RANGE_DAYS * 86_400_000) {
    throw new BookingValidationError(`Calendar queries are limited to ${MAX_QUERY_RANGE_DAYS} days at a time.`)
  }

  const [appointments, blockedSlots] = await Promise.all([
    AppointmentModel.find({
      status: { $in: ['pending', 'confirmed'] },
      startAt: { $lt: to },
      endAt: { $gt: from },
    })
      .select('startAt endAt status')
      .lean(),
    BlockedSlotModel.find({ startAt: { $lt: to }, endAt: { $gt: from } }).lean(),
  ])

  return {
    appointments: appointments.map((appointment) => ({
      id: appointment._id.toString(),
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status as 'pending' | 'confirmed',
    })),
    blockedSlots: blockedSlots.map((block) => ({
      id: block._id.toString(),
      label: block.label,
      startAt: block.startAt,
      endAt: block.endAt,
    })),
  }
}
