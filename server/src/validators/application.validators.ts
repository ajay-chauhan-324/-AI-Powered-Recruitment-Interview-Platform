import { z } from 'zod'
import { MANUAL_APPLICATION_STATUSES } from '../models/Application.model.js'
import { timezoneSchema } from './interview.validators.js'

export const createApplicationInputSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().min(1),
})

export const updateApplicationStatusInputSchema = z.object({
  status: z.enum(MANUAL_APPLICATION_STATUSES),
})

export const recruiterNotesInputSchema = z.object({
  notes: z.string().trim().max(4000),
})

export const roundOutcomeInputSchema = z.object({
  outcome: z.enum(['passed', 'failed']),
})

export const scheduleApplicationInterviewInputSchema = z.object({
  startAt: z.coerce.date(),
  timezone: timezoneSchema,
})

export const applicationRoundAvailabilityQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((value) => value.to > value.from, { message: 'to must be after from', path: ['to'] })
