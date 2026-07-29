import { z } from 'zod'
import { EMPLOYMENT_TYPES, WORKPLACE_TYPES } from '../models/Job.model.js'
import { EXPERIENCE_LEVELS } from '../models/User.model.js'
import { INTERVIEW_LOCATION_TYPES, INTERVIEW_TYPES } from '../models/Interview.model.js'

export const pipelineStageInputSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(INTERVIEW_TYPES),
  title: z.string().trim().min(1, 'Round title is required.').max(200),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  instructions: z.string().trim().max(2000).optional().or(z.literal('')),
  locationType: z.enum(INTERVIEW_LOCATION_TYPES).optional(),
})

/** Orders must be exactly 1..N with no gaps or duplicates — this is what lets
 * application.service.ts trust `rounds[].order` as a reliable sequence index. */
export const pipelineInputSchema = z
  .array(pipelineStageInputSchema)
  .max(20)
  .refine(
    (stages) => stages.every((stage, index) => stage.order === index + 1),
    { message: 'Interview rounds must be ordered sequentially starting at 1.' },
  )

export const jobInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200),
  description: z.string().trim().max(8000).optional().or(z.literal('')),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  workplaceType: z.enum(WORKPLACE_TYPES).optional(),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
  salaryCurrency: z.string().trim().max(10).optional(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  minExperienceYears: z.number().int().min(0).max(60).optional(),
  requiredSkills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  preferredSkills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  educationRequirement: z.string().trim().max(500).optional().or(z.literal('')),
  screeningQuestions: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
  pipeline: pipelineInputSchema.optional(),
  atsThreshold: z.number().int().min(0).max(100).optional(),
  closingDate: z.coerce.date().optional(),
})

export const updateJobInputSchema = jobInputSchema.partial()

export const publicJobQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  workplaceType: z.enum(WORKPLACE_TYPES).optional(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  location: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
