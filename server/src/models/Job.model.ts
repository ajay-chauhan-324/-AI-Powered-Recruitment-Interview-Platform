import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { EXPERIENCE_LEVELS } from './User.model.js'
import { INTERVIEW_LOCATION_TYPES, INTERVIEW_TYPES } from './Interview.model.js'

export const JOB_STATUSES = ['draft', 'published', 'paused', 'closed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship'] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const WORKPLACE_TYPES = ['remote', 'hybrid', 'onsite'] as const
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number]

/**
 * One ordered stage in this job's interview pipeline (CLAUDE.md's recruitment-pipeline
 * spec). `order` is 1-based and must be contiguous — enforced in job.validators.ts, not
 * here, since Mongoose array validation can't easily see the whole array's shape. Cloned
 * verbatim into each Application's `rounds[]` at application-creation time
 * (application.service.ts) — a job editing its pipeline later never retroactively changes
 * an already-submitted application's rounds.
 */
const pipelineStageSchema = new Schema(
  {
    order: { type: Number, required: true, min: 1 },
    type: { type: String, enum: INTERVIEW_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    durationMinutes: { type: Number, required: true, min: 15, max: 480, default: 60 },
    instructions: { type: String, trim: true, maxlength: 2000, default: '' },

    // The round builder is deliberately minimal — type, duration, and location only.
    // Interviewer/meeting-link detail is configured later, per candidate, when the recruiter
    // unlocks the round (application.service.ts's advanceApplicationRound), never here — a
    // job-level default would just be a second place for the same information to drift out
    // of sync with what's actually set per candidate.
    locationType: { type: String, enum: INTERVIEW_LOCATION_TYPES, default: 'video' },
  },
  { _id: false },
)

/**
 * A job posting owned by exactly one company/recruiter. `recruiterId` is denormalized
 * alongside `companyId` purely so ownership checks (job.service.ts) never need a Company
 * lookup just to verify "does this recruiter own this job" — both are set once at creation
 * and never diverge, since a recruiter owns exactly one company (Company.model.ts).
 */
const jobSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 250 },
    description: { type: String, trim: true, maxlength: 8000, default: '' },
    responsibilities: { type: [String], default: [] },

    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true, default: 'full_time' },
    workplaceType: { type: String, enum: WORKPLACE_TYPES, required: true, default: 'onsite' },
    location: { type: String, trim: true, maxlength: 200, default: '' },

    salaryMin: { type: Number, min: 0 },
    salaryMax: { type: Number, min: 0 },
    salaryCurrency: { type: String, trim: true, maxlength: 10, default: 'USD' },

    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, required: true, default: 'mid' },
    minExperienceYears: { type: Number, min: 0, default: 0 },
    requiredSkills: { type: [String], default: [] },
    preferredSkills: { type: [String], default: [] },
    educationRequirement: { type: String, trim: true, maxlength: 500, default: '' },
    screeningQuestions: { type: [String], default: [] },

    // The recruiter-defined, ordered interview pipeline for this job (CLAUDE.md §4/§9) — a
    // job must have at least one stage to be publishable (job.service.ts's publishJob).
    pipeline: { type: [pipelineStageSchema], default: [] },

    // Advisory only — never used to auto-reject an application (CLAUDE.md's AI principle:
    // AI output is never authorization). Purely a display/sort hint for the recruiter.
    atsThreshold: { type: Number, min: 0, max: 100, default: 60 },

    status: { type: String, enum: JOB_STATUSES, required: true, default: 'draft' },
    publishedAt: { type: Date, default: null },
    closingDate: { type: Date, default: null },
  },
  { timestamps: true },
)

// Public job listing: only published, most recent first.
jobSchema.index({ status: 1, publishedAt: -1 })
// Recruiter's own job list.
jobSchema.index({ recruiterId: 1, createdAt: -1 })
// Public company-profile page's job list (listPublicJobs filtered by both status AND
// companyId) — the index above covers status+publishedAt but not companyId, so that query
// still had to scan every published job and filter companyId in memory.
jobSchema.index({ status: 1, companyId: 1, publishedAt: -1 })

export type JobAttrs = InferSchemaType<typeof jobSchema>
export type JobDocument = HydratedDocument<JobAttrs>
export const JobModel = model('Job', jobSchema)
