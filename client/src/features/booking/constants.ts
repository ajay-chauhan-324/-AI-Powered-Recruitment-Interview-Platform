/** v1 default appointment length. CLAUDE.md doesn't define per-service-type durations,
 * so a single fixed default is used until a future phase adds configurable service types. */
export const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30

/** A reasonable starting point for the keyboard-accessible "Book an appointment" entry
 * point (as opposed to tapping a specific slot on the canvas) — an hour from now, rounded
 * to the next quarter-hour. If it's unavailable, BookingPanel's existing conflict ->
 * alternatives flow takes over from there. */
export function computeDefaultBookingStart(now: Date = new Date()): Date {
  const start = new Date(now.getTime() + 60 * 60_000)
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0)
  return start
}
