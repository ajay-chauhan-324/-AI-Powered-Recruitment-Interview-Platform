/** v1 default interview length until a future phase adds configurable per-interview-type
 * durations. */
export const DEFAULT_INTERVIEW_DURATION_MINUTES = 30

/** A reasonable starting point for the keyboard-accessible "Book an interview" entry
 * point (as opposed to tapping a specific slot on the canvas) — an hour from now, rounded
 * to the next quarter-hour. If it's unavailable, the booking panel's existing conflict ->
 * alternatives flow takes over from there. */
export function computeDefaultBookingStart(now: Date = new Date()): Date {
  const start = new Date(now.getTime() + 60 * 60_000)
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0)
  return start
}
