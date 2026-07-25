import { z } from 'zod'
import { APPOINTMENT_SOURCES } from '../models/Appointment.model.js'

/** Validated against real ICU timezone data (Intl), not a hardcoded list or string pattern. */
export const timezoneSchema = z.string().min(1).refine((value) => {
  try {
    return Boolean(new Intl.DateTimeFormat(undefined, { timeZone: value }))
  } catch {
    return false
  }
}, 'Must be a valid IANA timezone (e.g. "America/New_York")')

export const createAppointmentInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  purpose: z.string().trim().min(1).max(500),
  startAt: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(24 * 60),
  timezone: timezoneSchema,
  source: z.enum(APPOINTMENT_SOURCES),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentInputSchema>
