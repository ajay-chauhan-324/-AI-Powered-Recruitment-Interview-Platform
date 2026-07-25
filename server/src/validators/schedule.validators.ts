import { z } from 'zod'
import { timezoneSchema } from './appointment.validators.js'

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

export const scheduleConfigInputSchema = z.object({
  timezone: timezoneSchema,
  workingHours: z.array(workingHoursInputSchema),
  breaks: z.array(recurringBreakInputSchema),
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
export type BlockedSlotInput = z.infer<typeof blockedSlotInputSchema>
