import { z } from 'zod'
import { timezoneSchema } from './interview.validators.js'
import { EXPERIENCE_LEVELS } from '../models/User.model.js'

// Real strength requirements since, unlike admin accounts (CLI-created only, see
// scripts/create-admin.ts), registration here is self-service and open to whatever a
// candidate types.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(200)
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), {
    message: 'Password must include at least one letter and one number.',
  })

export const registerInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(200),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: passwordSchema,
    timezone: timezoneSchema.default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    accountType: z.enum(['candidate', 'recruiter']).default('candidate'),
    // Only meaningful (and required) when accountType is 'recruiter' — creates the
    // recruiter's one company (Company.model.ts) at registration time.
    companyName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((value) => value.accountType !== 'recruiter' || Boolean(value.companyName), {
    message: 'Company name is required to register as a recruiter.',
    path: ['companyName'],
  })

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
})

const experienceEntryInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  startDate: z.string().trim().max(20).optional().or(z.literal('')),
  endDate: z.string().trim().max(20).optional().or(z.literal('')),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
})

const educationEntryInputSchema = z.object({
  institution: z.string().trim().min(1).max(200),
  degree: z.string().trim().max(200).optional().or(z.literal('')),
  fieldOfStudy: z.string().trim().max(200).optional().or(z.literal('')),
  endYear: z.number().int().min(1950).max(2100).optional(),
})

const projectEntryInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  url: z.url().optional().or(z.literal('')),
})

export const updateProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  timezone: timezoneSchema.optional(),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  linkedIn: z.url().optional().or(z.literal('')),
  github: z.url().optional().or(z.literal('')),
  portfolioUrl: z.url().optional().or(z.literal('')),
  headline: z.string().trim().max(200).optional().or(z.literal('')),
  about: z.string().trim().max(2000).optional().or(z.literal('')),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  experience: z.array(experienceEntryInputSchema).max(20).optional(),
  education: z.array(educationEntryInputSchema).max(10).optional(),
  projects: z.array(projectEntryInputSchema).max(20).optional(),
})

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})
