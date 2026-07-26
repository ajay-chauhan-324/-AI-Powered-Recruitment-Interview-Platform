import { z } from 'zod'

export const dateRangeQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((value) => value.to > value.from, { message: 'to must be after from', path: ['to'] })

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>
