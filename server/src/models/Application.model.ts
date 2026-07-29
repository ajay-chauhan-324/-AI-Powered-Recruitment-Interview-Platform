import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { INTERVIEW_LOCATION_TYPES, INTERVIEW_TYPES } from './Interview.model.js'

export const APPLICATION_STATUSES = [
  'applied',
  'under_review',
  'shortlisted',
  'interview_in_progress',
  'selected',
  'rejected',
  'withdrawn',
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

/** Statuses a recruiter (or the recruiter-mode AI tool) may set directly via
 * updateApplicationStatus — `interview_in_progress` and `selected` are round-driven only
 * (application.service.ts's advanceApplicationRound/recordRoundOutcome), never set by hand,
 * so a recruiter can't jump the pipeline state without actually acting on a round. */
export const MANUAL_APPLICATION_STATUSES = ['under_review', 'shortlisted', 'rejected', 'withdrawn'] as const
export type ManualApplicationStatus = (typeof MANUAL_APPLICATION_STATUSES)[number]

export const APPLICATION_ROUND_STATUSES = ['locked', 'ready_to_book', 'scheduled', 'passed', 'failed'] as const
export type ApplicationRoundStatus = (typeof APPLICATION_ROUND_STATUSES)[number]

/**
 * One interview round on this application's pipeline — cloned from the owning Job's
 * `pipeline[]` at application-creation time (all `locked`), then progressed independently
 * per candidate. `order` is the sequence index (1-based, matching the source Job stage) —
 * every round-progression rule (advanceApplicationRound, recordRoundOutcome,
 * scheduleApplicationInterview) keys off `order`, never array position, so this must stay
 * stable even if the job's own pipeline is edited later. `interviewId` is only set once the
 * candidate actually books a real Interview via the existing InterviewService.
 */
const applicationRoundSchema = new Schema(
  {
    order: { type: Number, required: true, min: 1 },
    type: { type: String, enum: INTERVIEW_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    durationMinutes: { type: Number, required: true, min: 15, max: 480 },
    instructions: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: APPLICATION_ROUND_STATUSES, required: true, default: 'locked' },

    // Populated by the recruiter when unlocking this round (advanceApplicationRound) — held
    // here until the candidate picks a time, then copied onto the real Interview record.
    locationType: { type: String, enum: INTERVIEW_LOCATION_TYPES, default: null },
    meetingUrl: { type: String, trim: true, maxlength: 500, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    interviewerName: { type: String, trim: true, maxlength: 200, default: '' },
    interviewerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },

    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', default: null },
  },
  { _id: false },
)

const atsAnalysisSchema = new Schema(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    confidence: { type: String, enum: ['low', 'medium', 'high'], required: true },
    matchedSkills: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    experienceMatch: { type: String, trim: true, maxlength: 500, default: '' },
    educationMatch: { type: String, trim: true, maxlength: 500, default: '' },
    strengths: { type: [String], default: [] },
    gaps: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    evidence: { type: [String], default: [] },
    analyzedAt: { type: Date, required: true },
  },
  { _id: false },
)

/**
 * One application per (job, candidate) pair — see the unique index below. `atsAnalysis` is
 * nullable: AI analysis is best-effort at submission time (ai/atsAnalysis.service.ts) and a
 * failed/unavailable provider must never block the application itself (CLAUDE.md's AI
 * principle + the "AI analysis temporarily unavailable" empty state).
 */
const applicationSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true },
    atsAnalysis: { type: atsAnalysisSchema, default: null },
    status: { type: String, enum: APPLICATION_STATUSES, required: true, default: 'applied' },
    recruiterNotes: { type: String, trim: true, maxlength: 4000, default: '' },

    // The candidate's sequential interview pipeline for this application — cloned from the
    // job's pipeline at creation time (see createApplication) and progressed independently.
    // A candidate may only ever book the single round currently 'ready_to_book' (CLAUDE.md's
    // core rule: never an arbitrary interview) — enforced in application.service.ts, never
    // trusted from the client.
    rounds: { type: [applicationRoundSchema], default: [] },
  },
  { timestamps: true },
)

applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true })
applicationSchema.index({ candidateId: 1, createdAt: -1 })
applicationSchema.index({ jobId: 1, status: 1 })
// Supports listApplicationsForJob/listApplicationsForRecruiter's dominant sort
// ({ 'atsAnalysis.score': -1, createdAt: -1 }) — without this, jobId/status filtering is
// index-served but the ATS-score ranking still needs an in-memory sort on every request.
applicationSchema.index({ jobId: 1, 'atsAnalysis.score': -1 })

export type ApplicationAttrs = InferSchemaType<typeof applicationSchema>
export type ApplicationDocument = HydratedDocument<ApplicationAttrs>
export const ApplicationModel = model('Application', applicationSchema)
