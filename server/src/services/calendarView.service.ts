import { InterviewModel } from '../models/Interview.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import { BookingValidationError } from './booking.errors.js'

const MAX_QUERY_RANGE_DAYS = 62

/**
 * The PUBLIC-safe calendar read model — no authentication required, so this deliberately
 * excludes candidateName/candidateEmail/title/interviewType/notes and every other
 * candidate- or interview-identifying detail; it only ever says "this time is busy."
 * Cancelled interviews are also excluded: they don't represent current busy time, and
 * historical visibility is an admin concern, not a public one. An authenticated admin
 * variant with full detail and history exists separately (interview.service.ts's
 * listInterviewsInRange).
 */

export interface PublicCalendarInterview {
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
  interviews: PublicCalendarInterview[]
  blockedSlots: PublicCalendarBlock[]
}

export async function getPublicCalendarView(from: Date, to: Date): Promise<PublicCalendarView> {
  if (to.getTime() - from.getTime() > MAX_QUERY_RANGE_DAYS * 86_400_000) {
    throw new BookingValidationError(`Calendar queries are limited to ${MAX_QUERY_RANGE_DAYS} days at a time.`)
  }

  const [interviews, blockedSlots] = await Promise.all([
    InterviewModel.find({
      status: { $in: ['pending', 'confirmed'] },
      startAt: { $lt: to },
      endAt: { $gt: from },
    })
      .select('startAt endAt status')
      .lean(),
    BlockedSlotModel.find({ startAt: { $lt: to }, endAt: { $gt: from } }).lean(),
  ])

  return {
    interviews: interviews.map((interview) => ({
      id: interview._id.toString(),
      startAt: interview.startAt,
      endAt: interview.endAt,
      status: interview.status as 'pending' | 'confirmed',
    })),
    blockedSlots: blockedSlots.map((block) => ({
      id: block._id.toString(),
      label: block.label,
      startAt: block.startAt,
      endAt: block.endAt,
    })),
  }
}
