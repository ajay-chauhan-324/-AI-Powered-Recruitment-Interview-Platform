import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { BookingValidationError } from './booking.errors.js'

/**
 * The single centralized availability engine (CLAUDE.md §12). Every caller —
 * AI tools, public booking, admin — must go through these functions rather
 * than recomputing availability themselves. This module is read-only: it
 * never creates, updates, or deletes anything. InterviewService is the only
 * thing that writes interviews, and it re-checks availability again inside
 * its own transaction rather than trusting a prior call here.
 */

export const SLOT_GRANULARITY_MINUTES = 15
const MAX_QUERY_RANGE_DAYS = 62

export class ScheduleNotConfiguredError extends Error {
  constructor() {
    super('No schedule configuration exists yet — working hours have not been set up.')
    this.name = 'ScheduleNotConfiguredError'
  }
}

interface Interval {
  start: Date
  end: Date
}

export interface AvailableSlot {
  start: Date
  end: Date
}

export interface AvailabilityQuery {
  rangeStart: Date
  rangeEnd: Date
  durationMinutes: number
  /** Ignore this interview's own current time when checking for conflicts — needed so
   * rescheduling an interview doesn't collide with the slot it currently occupies. */
  excludeInterviewId?: string
}

export interface AlternativesQuery {
  preferredStart: Date
  durationMinutes: number
  count?: number
  searchWindowDays?: number
  excludeInterviewId?: string
}

async function getScheduleConfig() {
  const config = await ScheduleConfigModel.findOne({ singleton: 'default' })
  if (!config) throw new ScheduleNotConfiguredError()
  return config
}

/** Luxon weekday is 1 (Mon) .. 7 (Sun); the schedule models use JS's Date.getDay() convention, 0 (Sun) .. 6 (Sat). */
function jsWeekdayFromLuxon(luxonWeekday: number): number {
  return luxonWeekday % 7
}

/** Resolves a recurring (dayOfWeek, startMinutes/endMinutes) pattern into a concrete UTC interval for one specific
 * calendar date in the business's timezone — DST-safe because Luxon computes the instant, not naive clock math. */
function resolveLocalMinutesToUtcInterval(localDate: DateTime, startMinutes: number, endMinutes: number): Interval {
  const dayStart = localDate.startOf('day')
  return {
    start: dayStart.plus({ minutes: startMinutes }).toJSDate(),
    end: dayStart.plus({ minutes: endMinutes }).toJSDate(),
  }
}

/** Subtracts `remove` intervals from `base` intervals. O(n*m), which is fine at the scale a single day's
 * working-hours/breaks/interviews ever reach — this is not a general-purpose interval-tree implementation. */
function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  let result = base
  for (const sub of remove) {
    const next: Interval[] = []
    for (const interval of result) {
      if (sub.end <= interval.start || sub.start >= interval.end) {
        next.push(interval)
        continue
      }
      if (sub.start > interval.start) {
        next.push({ start: interval.start, end: sub.start })
      }
      if (sub.end < interval.end) {
        next.push({ start: sub.end, end: interval.end })
      }
    }
    result = next
  }
  return result.filter((interval) => interval.start < interval.end)
}

/**
 * Computes every open slot of `durationMinutes` within [rangeStart, rangeEnd), honoring working hours, recurring
 * breaks, one-off blocked periods, existing interviews (expanded by the configured buffer), the minimum-notice
 * window, the maximum booking window, and the current time (no slot starting in the past).
 */
export async function findAvailableSlots(query: AvailabilityQuery, now: Date = new Date()): Promise<AvailableSlot[]> {
  const { rangeStart, rangeEnd, durationMinutes, excludeInterviewId } = query
  if (rangeEnd <= rangeStart || durationMinutes <= 0) return []
  if (rangeEnd.getTime() - rangeStart.getTime() > MAX_QUERY_RANGE_DAYS * 86_400_000) {
    throw new BookingValidationError(`Availability queries are limited to ${MAX_QUERY_RANGE_DAYS} days at a time.`)
  }

  const config = await getScheduleConfig()
  const zone = config.timezone
  const bufferMs = config.bufferMinutes * 60_000
  // A slot may not start before `now + minNoticeMinutes`, nor may it start beyond
  // `now + maxBookingWindowDays` — both are booking RULES (business constraints relative to
  // "now"), distinct from MAX_QUERY_RANGE_DAYS above, which is a technical guard on how wide
  // a single query's [rangeStart, rangeEnd) may be.
  const earliestAllowedStart = new Date(now.getTime() + config.minNoticeMinutes * 60_000)
  const latestAllowedStart = new Date(now.getTime() + config.maxBookingWindowDays * 86_400_000)
  const effectiveRangeEnd = rangeEnd > latestAllowedStart ? latestAllowedStart : rangeEnd

  // Widened by the buffer on both sides: an interview whose raw [startAt, endAt) doesn't
  // overlap [rangeStart, effectiveRangeEnd) can still project a buffered interval that does
  // (e.g. an interview ending exactly at rangeStart, with a buffer after it) — if the query
  // itself isn't widened too, that interview would never even be fetched to have its buffer
  // applied below.
  const interviewFilter: Record<string, unknown> = {
    status: { $in: ['pending', 'confirmed'] },
    startAt: { $lt: new Date(effectiveRangeEnd.getTime() + bufferMs) },
    endAt: { $gt: new Date(rangeStart.getTime() - bufferMs) },
  }
  if (excludeInterviewId) {
    interviewFilter._id = { $ne: excludeInterviewId }
  }

  const [blockedSlots, existingInterviews] = await Promise.all([
    BlockedSlotModel.find({ startAt: { $lt: effectiveRangeEnd }, endAt: { $gt: rangeStart } }).lean(),
    InterviewModel.find(interviewFilter).lean(),
  ])

  const busyIntervals: Interval[] = [
    ...blockedSlots.map((slot) => ({ start: slot.startAt, end: slot.endAt })),
    // Buffer time is not itself a blocked period a person configured — it's a margin around
    // every interview, applied here rather than stored, so changing the buffer setting takes
    // effect immediately for every existing interview without a data migration.
    ...existingInterviews.map((interview) => ({
      start: new Date(interview.startAt.getTime() - bufferMs),
      end: new Date(interview.endAt.getTime() + bufferMs),
    })),
  ]

  const slots: AvailableSlot[] = []
  if (effectiveRangeEnd <= rangeStart) return slots

  const localRangeEnd = DateTime.fromJSDate(effectiveRangeEnd, { zone })
  let cursor = DateTime.fromJSDate(rangeStart, { zone }).startOf('day')

  while (cursor < localRangeEnd) {
    const jsDay = jsWeekdayFromLuxon(cursor.weekday)

    let freeIntervals: Interval[] = config.workingHours
      .filter((entry) => entry.dayOfWeek === jsDay && entry.isActive)
      .map((entry) => resolveLocalMinutesToUtcInterval(cursor, entry.startMinutes, entry.endMinutes))

    const breakIntervals = config.breaks
      .filter((entry) => entry.dayOfWeek === jsDay)
      .map((entry) => resolveLocalMinutesToUtcInterval(cursor, entry.startMinutes, entry.endMinutes))

    freeIntervals = subtractIntervals(freeIntervals, breakIntervals)
    freeIntervals = subtractIntervals(freeIntervals, busyIntervals)

    freeIntervals = freeIntervals
      .map((interval) => ({
        start: interval.start < rangeStart ? rangeStart : interval.start,
        end: interval.end > effectiveRangeEnd ? effectiveRangeEnd : interval.end,
      }))
      .filter((interval) => interval.start < interval.end)

    for (const interval of freeIntervals) {
      let slotStart = interval.start
      while (true) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000)
        if (slotEnd > interval.end) break
        if (slotStart >= earliestAllowedStart) {
          slots.push({ start: slotStart, end: slotEnd })
        }
        slotStart = new Date(slotStart.getTime() + SLOT_GRANULARITY_MINUTES * 60_000)
      }
    }

    cursor = cursor.plus({ days: 1 })
  }

  return slots
}

/** Whether this exact [start, start+durationMinutes) slot — not just some slot in that range — is free. */
export async function isSlotAvailable(
  start: Date,
  durationMinutes: number,
  now: Date = new Date(),
  excludeInterviewId?: string,
): Promise<boolean> {
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const slots = await findAvailableSlots({ rangeStart: start, rangeEnd: end, durationMinutes, excludeInterviewId }, now)
  return slots.some((slot) => slot.start.getTime() === start.getTime() && slot.end.getTime() === end.getTime())
}

/** The nearest available slots to a preferred (unavailable) time, sorted by proximity — powers "suggest alternatives". */
export async function findNearestAlternatives(
  query: AlternativesQuery,
  now: Date = new Date(),
): Promise<AvailableSlot[]> {
  const { preferredStart, durationMinutes, count = 3, searchWindowDays = 7, excludeInterviewId } = query

  const rangeStart = new Date(Math.max(now.getTime(), preferredStart.getTime() - searchWindowDays * 86_400_000))
  const rangeEnd = new Date(preferredStart.getTime() + searchWindowDays * 86_400_000)

  const slots = await findAvailableSlots({ rangeStart, rangeEnd, durationMinutes, excludeInterviewId }, now)

  return slots
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.start.getTime() - preferredStart.getTime()) - Math.abs(b.start.getTime() - preferredStart.getTime()),
    )
    .slice(0, count)
}
