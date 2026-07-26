import { z } from 'zod'

export const availabilityQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    durationMinutes: z.coerce.number().int().positive().max(24 * 60),
  })
  .refine((value) => value.to > value.from, { message: 'to must be after from', path: ['to'] })

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>
