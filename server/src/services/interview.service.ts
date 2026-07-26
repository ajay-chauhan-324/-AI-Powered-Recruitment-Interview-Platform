import crypto from 'node:crypto'
import mongoose, { isValidObjectId } from 'mongoose'
import { InterviewModel, type InterviewDocument } from '../models/Interview.model.js'
import { BookingLockModel } from '../models/BookingLock.model.js'
import { createInterviewInputSchema, type CreateInterviewInput } from '../validators/interview.validators.js'
import { findNearestAlternatives, isSlotAvailable } from './availability.service.js'
import { InterviewNotFoundError, BookingValidationError, SlotConflictError } from './booking.errors.js'
import { interviewEvents } from '../events/interviewEvents.js'
import { env } from '../config/env.js'
import {
  sendCancellationEmail,
  sendConfirmationEmail,
  sendInterviewerCancellationEmail,
  sendInterviewerConfirmationEmail,
  sendInterviewerRescheduleEmail,
  sendRescheduleEmail,
  type InterviewNotificationContext,
} from './notifications/notification.service.js'

function toNotificationContext(interview: InterviewDocument): InterviewNotificationContext {
  return {
    candidateName: interview.candidateName,
    candidateEmail: interview.candidateEmail,
    title: interview.title,
    interviewType: interview.interviewType,
    round: interview.round,
    locationType: interview.locationType,
    meetingUrl: interview.meetingUrl,
    address: interview.address,
    interviewerName: interview.interviewerName,
    startAt: interview.startAt,
    endAt: interview.endAt,
    timezone: interview.timezone,
  }
}

/** The booking itself has already succeeded by the time any of these run — a notification
 * failure (e.g. SMTP down) must never surface as a booking failure to the caller. */
async function notifySafely(send: () => Promise<void>): Promise<void> {
  try {
    await send()
  } catch (error) {
    console.error('[notification] failed to send:', error)
  }
}

function toEventPayload(interview: InterviewDocument) {
  return {
    id: interview._id.toString(),
    startAt: interview.startAt,
    endAt: interview.endAt,
    status: interview.status as 'pending' | 'confirmed' | 'cancelled',
  }
}

/**
 * The booking authority (CLAUDE.md §11). Every booking path — public, AI,
 * admin, API — must call these functions; none of them may reimplement
 * conflict detection themselves. The database is the source of truth.
 */

export interface CreateInterviewResult {
  interview: InterviewDocument
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

export async function createInterview(rawInput: CreateInterviewInput): Promise<CreateInterviewResult> {
  const input = createInterviewInputSchema.parse(rawInput)
  const now = new Date()

  if (input.startAt.getTime() <= now.getTime()) {
    throw new BookingValidationError('Interviews cannot be booked in the past.')
  }

  const endAt = new Date(input.startAt.getTime() + input.durationMinutes * 60_000)

  // Fast pre-check outside any transaction: working hours, breaks, blocked periods, buffer,
  // minimum notice, maximum booking window, and existing interviews.
  const preAvailable = await isSlotAvailable(input.startAt, input.durationMinutes, now)
  if (!preAvailable) {
    throw new SlotConflictError(
      await findNearestAlternatives({ preferredStart: input.startAt, durationMinutes: input.durationMinutes }, now),
    )
  }

  const { raw: manageToken, hash: manageTokenHash } = generateManageToken()

  const session = await mongoose.startSession()
  let created: InterviewDocument | null = null

  try {
    await withAlternativesOnConflict(
      () =>
        session.withTransaction(async () => {
          await touchBookingLock(session)

          // Never trust the pre-check above as final authority — re-verify inside the transaction.
          const conflict = await InterviewModel.findOne({
            status: { $in: ['pending', 'confirmed'] },
            startAt: { $lt: endAt },
            endAt: { $gt: input.startAt },
          }).session(session)

          if (conflict) {
            throw new SlotConflictError()
          }

          const [doc] = await InterviewModel.create(
            [
              {
                title: input.title,
                description: input.description,
                interviewType: input.interviewType,
                round: input.round,
                locationType: input.locationType,
                meetingUrl: input.meetingUrl,
                address: input.address,
                interviewerName: input.interviewerName,
                interviewerEmail: input.interviewerEmail,
                candidateName: input.candidateName,
                candidateEmail: input.candidateEmail,
                candidatePhone: input.candidatePhone,
                candidateLinkedIn: input.candidateLinkedIn,
                candidateGithub: input.candidateGithub,
                candidatePortfolioUrl: input.candidatePortfolioUrl,
                candidateResumeUrl: input.candidateResumeUrl,
                candidateNotes: input.candidateNotes,
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
    throw new Error('Interview creation failed unexpectedly.')
  }
  const finalInterview: InterviewDocument = created

  interviewEvents.emitInterviewEvent('interview.created', toEventPayload(finalInterview))

  void notifySafely(() =>
    sendConfirmationEmail({
      ...toNotificationContext(finalInterview),
      manageUrl: `${env.CLIENT_ORIGIN}/manage/${manageToken}`,
    }),
  )
  if (finalInterview.interviewerEmail) {
    void notifySafely(() =>
      sendInterviewerConfirmationEmail({
        ...toNotificationContext(finalInterview),
        interviewerEmail: finalInterview.interviewerEmail,
      }),
    )
  }

  return { interview: finalInterview, manageToken }
}

/** newDurationMinutes lets admins change an interview's length at the same time as moving it;
 * omit it to keep the current duration — this is the same reschedule path guest candidates
 * hit via their manage link, just with one more field. */
export async function rescheduleInterview(
  interviewId: string,
  newStart: Date,
  newDurationMinutes?: number,
): Promise<InterviewDocument> {
  if (!isValidObjectId(interviewId)) throw new InterviewNotFoundError()

  const now = new Date()
  if (newStart.getTime() <= now.getTime()) {
    throw new BookingValidationError('Cannot reschedule to a time in the past.')
  }
  if (newDurationMinutes !== undefined && newDurationMinutes <= 0) {
    throw new BookingValidationError('Duration must be positive.')
  }

  const session = await mongoose.startSession()
  let updated: InterviewDocument | null = null
  let durationMinutes = 0

  try {
    await withAlternativesOnConflict(
      () =>
        session.withTransaction(async () => {
          await touchBookingLock(session)

          const existing = await InterviewModel.findById(interviewId).session(session)
          if (!existing || existing.status === 'cancelled') {
            throw new InterviewNotFoundError()
          }
          durationMinutes = newDurationMinutes ?? existing.durationMinutes

          const newEnd = new Date(newStart.getTime() + durationMinutes * 60_000)

          // Excludes the interview's own current (pre-move) row — otherwise a reschedule that
          // overlaps its own existing slot (e.g. moving 9:00-9:30 to 9:15-9:45) would look like a
          // conflict with itself.
          const conflict = await InterviewModel.findOne({
            _id: { $ne: existing._id },
            status: { $in: ['pending', 'confirmed'] },
            startAt: { $lt: newEnd },
            endAt: { $gt: newStart },
          }).session(session)

          if (conflict) {
            throw new SlotConflictError()
          }

          existing.rescheduleHistory.push({
            previousStartAt: existing.startAt,
            previousEndAt: existing.endAt,
            changedAt: now,
          })
          existing.startAt = newStart
          existing.endAt = newEnd
          existing.durationMinutes = durationMinutes
          await existing.save({ session })
          updated = existing
        }),
      () =>
        findNearestAlternatives(
          { preferredStart: newStart, durationMinutes, excludeInterviewId: interviewId },
          now,
        ),
    )
  } finally {
    await session.endSession()
  }

  if (!updated) {
    throw new Error('Interview reschedule failed unexpectedly.')
  }
  const finalInterview: InterviewDocument = updated

  interviewEvents.emitInterviewEvent('interview.updated', toEventPayload(finalInterview))

  void notifySafely(() => sendRescheduleEmail(toNotificationContext(finalInterview)))
  if (finalInterview.interviewerEmail) {
    void notifySafely(() =>
      sendInterviewerRescheduleEmail({
        ...toNotificationContext(finalInterview),
        interviewerEmail: finalInterview.interviewerEmail,
      }),
    )
  }

  return finalInterview
}

export async function cancelInterview(interviewId: string): Promise<InterviewDocument> {
  if (!isValidObjectId(interviewId)) throw new InterviewNotFoundError()

  const existing = await InterviewModel.findById(interviewId)
  if (!existing || existing.status === 'cancelled') {
    throw new InterviewNotFoundError()
  }

  existing.status = 'cancelled'
  await existing.save()

  interviewEvents.emitInterviewEvent('interview.cancelled', toEventPayload(existing))

  void notifySafely(() => sendCancellationEmail(toNotificationContext(existing)))
  if (existing.interviewerEmail) {
    void notifySafely(() =>
      sendInterviewerCancellationEmail({ ...toNotificationContext(existing), interviewerEmail: existing.interviewerEmail }),
    )
  }

  return existing
}

export async function getInterviewByToken(rawToken: string): Promise<InterviewDocument | null> {
  return InterviewModel.findOne({ manageTokenHash: hashManageToken(rawToken) })
}

export async function getInterviewById(interviewId: string): Promise<InterviewDocument | null> {
  if (!isValidObjectId(interviewId)) return null
  return InterviewModel.findById(interviewId)
}

// Wider than the public/availability views' 62-day cap (admins get full historical
// visibility), but still bounded — an unbounded range on an authenticated route is still a
// real memory/performance risk, not just a public-abuse one.
const MAX_ADMIN_QUERY_RANGE_DAYS = 366

/** Admin-only: full detail, including cancelled interviews (preserve historical visibility)
 * — never used by the anonymous public calendar view. */
export async function listInterviewsInRange(from: Date, to: Date): Promise<InterviewDocument[]> {
  if (to.getTime() - from.getTime() > MAX_ADMIN_QUERY_RANGE_DAYS * 86_400_000) {
    throw new BookingValidationError(`Admin interview queries are limited to ${MAX_ADMIN_QUERY_RANGE_DAYS} days at a time.`)
  }
  return InterviewModel.find({ startAt: { $lt: to }, endAt: { $gt: from } }).sort({ startAt: 1 })
}

/** Candidate management (Phase E): every interview for one candidate, across all statuses,
 * newest first — powers the admin candidate detail view (upcoming/history/cancelled). */
export async function listInterviewsForCandidate(candidateEmail: string): Promise<InterviewDocument[]> {
  return InterviewModel.find({ candidateEmail: candidateEmail.trim().toLowerCase() }).sort({ startAt: -1 })
}

export interface CandidateSummary {
  candidateEmail: string
  candidateName: string
  candidatePhone: string
  totalInterviews: number
  upcomingCount: number
  lastInterviewAt: Date
}

const MAX_CANDIDATE_RESULTS = 200

/** One row per distinct candidate (grouped by email — the same identity key manage-token
 * lookups use), most recently active first. Optional `search` matches candidateName/
 * candidateEmail case-insensitively; kept as a simple $regex since candidate volumes here
 * don't warrant a text index. */
export async function listCandidates(search?: string): Promise<CandidateSummary[]> {
  const now = new Date()
  const match: Record<string, unknown> = {}
  if (search && search.trim().length > 0) {
    const pattern = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    match.$or = [
      { candidateName: { $regex: pattern, $options: 'i' } },
      { candidateEmail: { $regex: pattern, $options: 'i' } },
    ]
  }

  const rows = await InterviewModel.aggregate<{
    _id: string
    candidateName: string
    candidatePhone: string
    totalInterviews: number
    upcomingCount: number
    lastInterviewAt: Date
  }>([
    { $match: match },
    { $sort: { startAt: -1 } },
    {
      $group: {
        _id: '$candidateEmail',
        candidateName: { $first: '$candidateName' },
        candidatePhone: { $first: '$candidatePhone' },
        totalInterviews: { $sum: 1 },
        upcomingCount: {
          $sum: { $cond: [{ $and: [{ $gt: ['$startAt', now] }, { $ne: ['$status', 'cancelled'] }] }, 1, 0] },
        },
        lastInterviewAt: { $max: '$startAt' },
      },
    },
    { $sort: { lastInterviewAt: -1 } },
    { $limit: MAX_CANDIDATE_RESULTS },
  ])

  return rows.map((row) => ({
    candidateEmail: row._id,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    totalInterviews: row.totalInterviews,
    upcomingCount: row.upcomingCount,
    lastInterviewAt: row.lastInterviewAt,
  }))
}

export interface DashboardStats {
  todayCount: number
  upcomingCount: number
  totalScheduled: number
  cancelledCount: number
  rescheduledCount: number
  upcomingInterviews: InterviewDocument[]
}

const DASHBOARD_UPCOMING_LIMIT = 8

/** Powers the admin dashboard (Phase E) — a handful of counts plus the next few upcoming
 * interviews, computed directly from the same InterviewModel every other admin view reads,
 * not a separate cached/derived store. `todayStart`/`todayEnd` should be the business's
 * local midnight-to-midnight window (the caller resolves this from ScheduleConfig's
 * timezone) so "today" means the same thing here as it does on the calendar. */
export async function getDashboardStats(now: Date, todayStart: Date, todayEnd: Date): Promise<DashboardStats> {
  const [todayCount, upcomingCount, totalScheduled, cancelledCount, rescheduledCount, upcomingInterviews] =
    await Promise.all([
      InterviewModel.countDocuments({
        status: { $ne: 'cancelled' },
        startAt: { $lt: todayEnd },
        endAt: { $gt: todayStart },
      }),
      InterviewModel.countDocuments({ status: { $in: ['pending', 'confirmed'] }, startAt: { $gt: now } }),
      InterviewModel.countDocuments({ status: { $ne: 'cancelled' } }),
      InterviewModel.countDocuments({ status: 'cancelled' }),
      InterviewModel.countDocuments({ 'rescheduleHistory.0': { $exists: true } }),
      InterviewModel.find({ status: { $in: ['pending', 'confirmed'] }, startAt: { $gt: now } })
        .sort({ startAt: 1 })
        .limit(DASHBOARD_UPCOMING_LIMIT),
    ])

  return { todayCount, upcomingCount, totalScheduled, cancelledCount, rescheduledCount, upcomingInterviews }
}
