import { z } from 'zod'
import { INTERVIEW_LOCATION_TYPES, INTERVIEW_SOURCES, INTERVIEW_TYPES } from '../models/Interview.model.js'

/** Validated against real ICU timezone data (Intl), not a hardcoded list or string pattern. */
export const timezoneSchema = z.string().min(1).refine((value) => {
  try {
    return Boolean(new Intl.DateTimeFormat(undefined, { timeZone: value }))
  } catch {
    return false
  }
}, 'Must be a valid IANA timezone (e.g. "America/New_York")')

export const createInterviewInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  interviewType: z.enum(INTERVIEW_TYPES).optional(),
  round: z.number().int().positive().max(50).optional(),
  locationType: z.enum(INTERVIEW_LOCATION_TYPES).optional(),
  meetingUrl: z.string().trim().max(500).optional(),
  address: z.string().trim().max(500).optional(),
  interviewerName: z.string().trim().max(200).optional(),
  interviewerEmail: z.string().trim().toLowerCase().max(254).optional(),

  candidateName: z.string().trim().min(1).max(200),
  candidateEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  candidatePhone: z.string().trim().max(30).optional(),
  candidateLinkedIn: z.string().trim().max(300).optional(),
  candidateGithub: z.string().trim().max(300).optional(),
  candidatePortfolioUrl: z.string().trim().max(300).optional(),
  candidateResumeUrl: z.string().trim().max(500).optional(),
  candidateNotes: z.string().trim().max(2000).optional(),

  startAt: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(24 * 60),
  timezone: timezoneSchema,
  source: z.enum(INTERVIEW_SOURCES),
})

export type CreateInterviewInput = z.infer<typeof createInterviewInputSchema>

/** The public booking endpoint's request body — deliberately omits `source`. A client must
 * never be trusted to declare its own provenance; the controller hardcodes `source: 'public'`
 * regardless of anything in the request body. */
export const publicCreateInterviewInputSchema = createInterviewInputSchema.omit({ source: true })
export type PublicCreateInterviewInput = z.infer<typeof publicCreateInterviewInputSchema>

export const rescheduleInterviewInputSchema = z.object({
  newStart: z.coerce.date(),
})
