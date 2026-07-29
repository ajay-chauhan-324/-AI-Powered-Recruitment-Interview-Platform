import { z } from 'zod'
import { timezoneSchema } from './interview.validators.js'
import { FIXED_BREAKS, FIXED_SCHEDULE_TIMEZONE, FIXED_WORKING_HOURS } from '../config/scheduleDefaults.js'

/** Order-independent comparison by dayOfWeek — the fixed policy is the source of truth,
 * not whatever order a client happens to submit entries in. */
function matchesFixedPattern<T extends { dayOfWeek: number }>(value: T[], fixed: T[]): boolean {
  if (value.length !== fixed.length) return false
  const byDay = new Map(fixed.map((entry) => [entry.dayOfWeek, entry]))
  return value.every((entry) => {
    const expected = byDay.get(entry.dayOfWeek)
    return expected !== undefined && JSON.stringify(entry) === JSON.stringify(expected)
  })
}

const dayAndRangeSchema = {
  dayOfWeek: z.number().int().min(0).max(6),
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
}

export const workingHoursInputSchema = z
  .object({ ...dayAndRangeSchema, isActive: z.boolean().default(true) })
  .refine((value) => value.endMinutes > value.startMinutes, {
    message: 'endMinutes must be after startMinutes',
    path: ['endMinutes'],
  })

export const recurringBreakInputSchema = z
  .object({ ...dayAndRangeSchema, label: z.string().trim().min(1).max(100) })
  .refine((value) => value.endMinutes > value.startMinutes, {
    message: 'endMinutes must be after startMinutes',
    path: ['endMinutes'],
  })

export const scheduleConfigInputSchema = z
  .object({
    timezone: timezoneSchema,
    workingHours: z.array(workingHoursInputSchema),
    breaks: z.array(recurringBreakInputSchema),
    // Interview booking rules (CLAUDE.md's admin schedule-settings requirements). Optional so
    // existing PUT payloads that predate these fields still validate — the model's own
    // defaults (0/0/60) apply when omitted.
    bufferMinutes: z.number().int().min(0).max(1440).optional(),
    minNoticeMinutes: z.number().int().min(0).max(10_080).optional(),
    maxBookingWindowDays: z.number().int().min(1).max(365).optional(),
  })
  // Interview timing is fixed product policy (Asia/Kolkata, Mon-Fri 10:00-13:00 & 15:00-19:00),
  // not admin-configurable — see server/src/config/scheduleDefaults.ts.
  .refine((value) => value.timezone === FIXED_SCHEDULE_TIMEZONE, {
    message: `timezone is fixed at ${FIXED_SCHEDULE_TIMEZONE} and cannot be changed`,
    path: ['timezone'],
  })
  .refine((value) => matchesFixedPattern(value.workingHours, FIXED_WORKING_HOURS), {
    message: 'workingHours is fixed product policy and cannot be changed',
    path: ['workingHours'],
  })
  .refine((value) => matchesFixedPattern(value.breaks, FIXED_BREAKS), {
    message: 'breaks is fixed product policy and cannot be changed',
    path: ['breaks'],
  })

/**
 * The recruitment platform's per-recruiter calendar input (CLAUDE.md §36 second pivot) — the
 * SAME field shapes as scheduleConfigInputSchema above (workingHoursInputSchema/
 * recurringBreakInputSchema are already fully generic), just without the three fixed-pattern
 * `.refine()`s: a recruiter's calendar is never locked to Asia/Kolkata 10:00-13:00/15:00-19:00.
 * Used only by the recruiter-facing schedule endpoint — the legacy admin endpoint keeps using
 * scheduleConfigInputSchema, untouched.
 */
export const recruiterScheduleConfigInputSchema = z.object({
  timezone: timezoneSchema,
  workingHours: z.array(workingHoursInputSchema),
  breaks: z.array(recurringBreakInputSchema),
  bufferMinutes: z.number().int().min(0).max(1440).optional(),
  minNoticeMinutes: z.number().int().min(0).max(10_080).optional(),
  maxBookingWindowDays: z.number().int().min(1).max(365).optional(),
})

export const blockedSlotInputSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
  })
  .refine((value) => value.endAt > value.startAt, { message: 'endAt must be after startAt', path: ['endAt'] })

export type WorkingHoursInput = z.infer<typeof workingHoursInputSchema>
export type RecurringBreakInput = z.infer<typeof recurringBreakInputSchema>
export type ScheduleConfigInput = z.infer<typeof scheduleConfigInputSchema>
export type RecruiterScheduleConfigInput = z.infer<typeof recruiterScheduleConfigInputSchema>
export type BlockedSlotInput = z.infer<typeof blockedSlotInputSchema>
