import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import { AppointmentModel } from '../models/Appointment.model.js'

/**
 * The single centralized availability engine (CLAUDE.md §12). Every caller —
 * AI tools, public booking, admin — must go through these functions rather
 * than recomputing availability themselves. This module is read-only: it
 * never creates, updates, or deletes anything. AppointmentService (Phase 4)
 * is the only thing that writes appointments, and it re-checks availability
 * again inside its own transaction rather than trusting a prior call here.
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
  /** Ignore this appointment's own current time when checking for conflicts — needed so
   * rescheduling an appointment doesn't collide with the slot it currently occupies. */
  excludeAppointmentId?: string
}

export interface AlternativesQuery {
  preferredStart: Date
  durationMinutes: number
  count?: number
  searchWindowDays?: number
  excludeAppointmentId?: string
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
 * working-hours/breaks/appointments ever reach — this is not a general-purpose interval-tree implementation. */
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
 * breaks, one-off blocked periods, existing appointments, and the current time (no slot starting in the past).
 */
export async function findAvailableSlots(query: AvailabilityQuery, now: Date = new Date()): Promise<AvailableSlot[]> {
  const { rangeStart, rangeEnd, durationMinutes, excludeAppointmentId } = query
  if (rangeEnd <= rangeStart || durationMinutes <= 0) return []
  if (rangeEnd.getTime() - rangeStart.getTime() > MAX_QUERY_RANGE_DAYS * 86_400_000) {
    throw new Error(`Availability queries are limited to ${MAX_QUERY_RANGE_DAYS} days at a time.`)
  }

  const config = await getScheduleConfig()
  const zone = config.timezone

  const appointmentFilter: Record<string, unknown> = {
    status: { $in: ['pending', 'confirmed'] },
    startAt: { $lt: rangeEnd },
    endAt: { $gt: rangeStart },
  }
  if (excludeAppointmentId) {
    appointmentFilter._id = { $ne: excludeAppointmentId }
  }

  const [blockedSlots, existingAppointments] = await Promise.all([
    BlockedSlotModel.find({ startAt: { $lt: rangeEnd }, endAt: { $gt: rangeStart } }).lean(),
    AppointmentModel.find(appointmentFilter).lean(),
  ])

  const busyIntervals: Interval[] = [
    ...blockedSlots.map((slot) => ({ start: slot.startAt, end: slot.endAt })),
    ...existingAppointments.map((appointment) => ({ start: appointment.startAt, end: appointment.endAt })),
  ]

  const slots: AvailableSlot[] = []
  const localRangeEnd = DateTime.fromJSDate(rangeEnd, { zone })
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
        end: interval.end > rangeEnd ? rangeEnd : interval.end,
      }))
      .filter((interval) => interval.start < interval.end)

    for (const interval of freeIntervals) {
      let slotStart = interval.start
      while (true) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000)
        if (slotEnd > interval.end) break
        if (slotStart > now) {
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
  excludeAppointmentId?: string,
): Promise<boolean> {
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const slots = await findAvailableSlots({ rangeStart: start, rangeEnd: end, durationMinutes, excludeAppointmentId }, now)
  return slots.some((slot) => slot.start.getTime() === start.getTime() && slot.end.getTime() === end.getTime())
}

/** The nearest available slots to a preferred (unavailable) time, sorted by proximity — powers "suggest alternatives". */
export async function findNearestAlternatives(
  query: AlternativesQuery,
  now: Date = new Date(),
): Promise<AvailableSlot[]> {
  const { preferredStart, durationMinutes, count = 3, searchWindowDays = 7, excludeAppointmentId } = query

  const rangeStart = new Date(Math.max(now.getTime(), preferredStart.getTime() - searchWindowDays * 86_400_000))
  const rangeEnd = new Date(preferredStart.getTime() + searchWindowDays * 86_400_000)

  const slots = await findAvailableSlots({ rangeStart, rangeEnd, durationMinutes, excludeAppointmentId }, now)

  return slots
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.start.getTime() - preferredStart.getTime()) - Math.abs(b.start.getTime() - preferredStart.getTime()),
    )
    .slice(0, count)
}
