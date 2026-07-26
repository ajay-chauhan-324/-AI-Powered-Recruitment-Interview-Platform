import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const INTERVIEW_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] as const
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number]

export const INTERVIEW_SOURCES = ['ai', 'admin', 'public'] as const
export type InterviewSource = (typeof INTERVIEW_SOURCES)[number]

export const INTERVIEW_TYPES = [
  'hr_screening',
  'technical',
  'coding',
  'system_design',
  'behavioral',
  'managerial',
  'final',
  'panel',
  'custom',
] as const
export type InterviewType = (typeof INTERVIEW_TYPES)[number]

export const INTERVIEW_LOCATION_TYPES = ['video', 'phone', 'onsite', 'custom'] as const
export type InterviewLocationType = (typeof INTERVIEW_LOCATION_TYPES)[number]

const rescheduleHistoryEntrySchema = new Schema(
  {
    previousStartAt: { type: Date, required: true },
    previousEndAt: { type: Date, required: true },
    changedAt: { type: Date, required: true },
  },
  { _id: false },
)

/**
 * startAt/endAt are always stored in UTC; `timezone` records the candidate's timezone at
 * booking time for display/notification formatting only — it is never used to reinterpret
 * startAt/endAt. `manageTokenHash` stores a hash of the guest management token, never the
 * raw token (CLAUDE.md §19).
 *
 * This is the interview-domain evolution of the original Appointment model (see CLAUDE.md's
 * "PRODUCT PIVOT" notice) — the scheduling core (startAt/endAt/duration/timezone/status/
 * source/manageTokenHash, the {status,startAt,endAt} index, conflict-safe transactions) is
 * unchanged; the new fields describe *what kind* of interview this is and who it's with.
 * InterviewService (formerly AppointmentService) remains the only code path allowed to
 * write here.
 */
const interviewSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    interviewType: { type: String, enum: INTERVIEW_TYPES, required: true, default: 'custom' },
    round: { type: Number, required: true, min: 1, default: 1 },
    locationType: { type: String, enum: INTERVIEW_LOCATION_TYPES, required: true, default: 'video' },
    meetingUrl: { type: String, trim: true, maxlength: 500, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    interviewerName: { type: String, trim: true, maxlength: 200, default: '' },
    interviewerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },

    candidateName: { type: String, required: true, trim: true, maxlength: 200 },
    candidateEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    candidatePhone: { type: String, trim: true, maxlength: 30, default: '' },
    candidateLinkedIn: { type: String, trim: true, maxlength: 300, default: '' },
    candidateGithub: { type: String, trim: true, maxlength: 300, default: '' },
    candidatePortfolioUrl: { type: String, trim: true, maxlength: 300, default: '' },
    candidateResumeUrl: { type: String, trim: true, maxlength: 500, default: '' },
    candidateNotes: { type: String, trim: true, maxlength: 2000, default: '' },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    timezone: { type: String, required: true, trim: true },
    status: { type: String, enum: INTERVIEW_STATUSES, required: true, default: 'pending' },
    source: { type: String, enum: INTERVIEW_SOURCES, required: true },
    manageTokenHash: { type: String, required: true, unique: true },
    rescheduleHistory: { type: [rescheduleHistoryEntrySchema], required: true, default: [] },
  },
  { timestamps: true },
)

// Supports the overlap query InterviewService runs inside a transaction before every
// create/reschedule: { status: 'confirmed', startAt: { $lt }, endAt: { $gt } }.
interviewSchema.index({ status: 1, startAt: 1, endAt: 1 })
// Supports candidate-management lookups/search (Phase E).
interviewSchema.index({ candidateEmail: 1 })

/** The plain data shape (used for `.lean()` query results) — no `_id`, no instance methods. */
export type InterviewAttrs = InferSchemaType<typeof interviewSchema>
/** A real Mongoose document instance — has `_id`, `.save()`, etc. Use this everywhere a hydrated document is expected. */
export type InterviewDocument = HydratedDocument<InterviewAttrs>
// Collection is explicitly named `interviews` (not the Mongoose-pluralized default derived
// from the model name, which would already be "interviews" here anyway, but pinning it
// explicitly documents the rename from the original `appointments` collection — see
// server/src/scripts/migrate-appointments-to-interviews.ts).
export const InterviewModel = model('Interview', interviewSchema, 'interviews')
