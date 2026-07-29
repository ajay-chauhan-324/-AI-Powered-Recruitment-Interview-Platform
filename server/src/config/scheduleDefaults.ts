/**
 * Product policy for the recruitment platform's AI interview scheduler (CLAUDE.md pivot spec):
 * interviews always run on Indian Standard Time, Monday-Friday, 10:00-13:00 and 15:00-19:00.
 * This is fixed, not admin-configurable — schedule.validators.ts rejects any other value.
 */
export const FIXED_SCHEDULE_TIMEZONE = 'Asia/Kolkata'

const WORKING_DAYS = [1, 2, 3, 4, 5]

export const FIXED_WORKING_HOURS = WORKING_DAYS.map((dayOfWeek) => ({
  dayOfWeek,
  startMinutes: 600, // 10:00
  endMinutes: 1140, // 19:00
  isActive: true,
}))

export const FIXED_BREAKS = WORKING_DAYS.map((dayOfWeek) => ({
  dayOfWeek,
  startMinutes: 780, // 13:00
  endMinutes: 900, // 15:00
  label: 'Break',
}))
