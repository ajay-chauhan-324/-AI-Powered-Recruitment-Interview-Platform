/** Pixel height of one hour row at the "comfortable" density used throughout Phase 1. */
export const HOUR_ROW_HEIGHT = 64

/** Matches server/src/services/availability.service.ts's SLOT_GRANULARITY_MINUTES — used
 * client-side only to snap a clicked time to a tidy value, not for any correctness check
 * (the backend independently validates the exact requested time regardless of alignment). */
export const SLOT_GRANULARITY_MINUTES = 15

/** Converts a pixel Y-offset within a day rail into the local time it represents,
 * snapped to SLOT_GRANULARITY_MINUTES. Used for click-to-book (CLAUDE.md §18 — a tap,
 * never a drag). */
export function offsetToTimeOfDay(offsetY: number): { hour: number; minute: number } {
  const rawMinutes = (offsetY / HOUR_ROW_HEIGHT) * 60
  const snapped = Math.round(rawMinutes / SLOT_GRANULARITY_MINUTES) * SLOT_GRANULARITY_MINUTES
  const clamped = Math.min(Math.max(snapped, 0), 24 * 60 - SLOT_GRANULARITY_MINUTES)
  return { hour: Math.floor(clamped / 60), minute: clamped % 60 }
}

export function minutesToOffset(hour: number, minute: number): number {
  return ((hour * 60 + minute) / 60) * HOUR_ROW_HEIGHT
}

export function durationToHeight(durationMinutes: number): number {
  return (durationMinutes / 60) * HOUR_ROW_HEIGHT
}

export function formatClock(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  const displayMinute = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${displayHour}${displayMinute} ${period}`
}

/** Real-Date variants — used for actual appointment/blocked-slot data (as opposed to the
 * fixed hour/minute numbers used for the rail's own hour labels). Positions are relative to
 * the LOCAL (browser) calendar day, matching how the day/week grid itself is laid out. */

export function offsetForDate(date: Date): number {
  return minutesToOffset(date.getHours(), date.getMinutes())
}

export function heightForRange(start: Date, end: Date): number {
  const minutes = (end.getTime() - start.getTime()) / 60_000
  return (minutes / 60) * HOUR_ROW_HEIGHT
}

export function formatClockFromDate(date: Date): string {
  return formatClock(date.getHours(), date.getMinutes())
}

/** Clips a [startAt, endAt) range to a single day's boundaries — needed because an appointment
 * or blocked range can span midnight while the Day/Week grid only ever shows one calendar day
 * at a time; without clipping, a multi-day block would render at the wrong offset. */
export function clipRangeToDay(
  startAt: Date,
  endAt: Date,
  dayStart: Date,
  dayEnd: Date,
): { start: Date; end: Date } | null {
  const start = startAt < dayStart ? dayStart : startAt
  const end = endAt > dayEnd ? dayEnd : endAt
  if (start >= end) return null
  return { start, end }
}

/** 0 (Monday) .. 6 (Sunday), matching the week view's column order — unlike JS's native
 * Date.getDay() which is 0 (Sunday) .. 6 (Saturday). */
export function weekdayIndexMondayFirst(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}
