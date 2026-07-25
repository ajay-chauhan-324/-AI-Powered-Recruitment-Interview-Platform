/** Pixel height of one hour row at the "comfortable" density used throughout Phase 1. */
export const HOUR_ROW_HEIGHT = 64

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
