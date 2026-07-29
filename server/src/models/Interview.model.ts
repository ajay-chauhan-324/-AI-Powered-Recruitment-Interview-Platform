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

// Distinct from locationType above (which describes the human-facing format — video/phone/
// onsite/custom): this describes whether the interview has an in-platform Meeting Room at
// all. Only 'online' is actually implemented; 'offline' exists so the schema/enum never needs
// a breaking change when that's built — no offline-specific logic exists yet (CLAUDE.md-style
// "future-ready" pattern, matching how INTERVIEW_LOCATION_TYPES already has 'custom' with no
// dedicated UI).
export const MEETING_TYPES = ['online', 'offline'] as const
export type MeetingType = (typeof MEETING_TYPES)[number]

export const MEETING_STATUSES = ['not_started', 'waiting', 'in_progress', 'ended'] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

export const MEETING_PARTICIPANT_ROLES = ['candidate', 'recruiter'] as const
export type MeetingParticipantRole = (typeof MEETING_PARTICIPANT_ROLES)[number]

const meetingParticipantSchema = new Schema(
  {
    role: { type: String, enum: MEETING_PARTICIPANT_ROLES, required: true },
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
  },
  { _id: false },
)

/**
 * The platform's own Meeting Room state for one interview (Task: "In-Platform Interview
 * Meeting") — never a Google Meet/Zoom link. `meetingId` is an opaque random token (same
 * generation pattern as the guest manage token) used both as the room key for Socket.IO
 * signaling (server/src/sockets/meetingNamespace.ts) and as the public path segment of
 * `meetingUrl` (/meeting/:meetingId). `status` starts 'not_started' at booking time, moves to
 * 'waiting' when the first participant joins the room, 'in_progress' once both have joined,
 * and 'ended' when either side leaves for good — this is presentation/analytics state only,
 * never an authorization boundary (see meetingNamespace.ts for the actual join check).
 * `reminder30Sent`/`reminder5Sent` make the reminder scheduler idempotent across restarts.
 */
const meetingSchema = new Schema(
  {
    meetingId: { type: String, required: true },
    status: { type: String, enum: MEETING_STATUSES, required: true, default: 'not_started' },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    participants: { type: [meetingParticipantSchema], default: [] },
    reminder30Sent: { type: Boolean, required: true, default: false },
    reminder5Sent: { type: Boolean, required: true, default: false },
  },
  { _id: false },
)

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
    meetingType: { type: String, enum: MEETING_TYPES, required: true, default: 'online' },
    meetingUrl: { type: String, trim: true, maxlength: 500, default: '' },
    meeting: { type: meetingSchema, default: null },
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

    // Nullable/optional and fully additive: only interviews booked while signed in carry
    // this. Guest and pre-existing interviews keep userId: null and are still reachable via
    // candidateEmail — see my-interviews querying in interviews.route.ts. Never populated from
    // client input; only ever set server-side from a verified session (userAuth.ts).
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Nullable/optional and fully additive: only interviews that originated from a recruiter
    // invitation on an application carry these — the interview-creation and conflict-safe
    // scheduling engine is unchanged and unaware of the recruitment domain (recruiter, job,
    // and application ownership are checked entirely in application.service.ts before this
    // interview is ever created).
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },

    // Denormalized from Job.recruiterId at creation time (application.service.ts's
    // scheduleApplicationInterview) — null for interviews that didn't originate from the
    // recruitment pipeline (the legacy generic/admin booking product, CLAUDE.md §36.9, which
    // keeps sharing the one global calendar). InterviewService scopes every conflict-
    // detection query by this field so recruiter A's bookings can never block or be blocked
    // by recruiter B's slots at the same wall-clock time (CLAUDE.md §36 second pivot:
    // per-recruiter calendars) — never populated from client input.
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

// Supports the overlap query InterviewService runs inside a transaction before every
// create/reschedule: { status: 'confirmed', startAt: { $lt }, endAt: { $gt } }.
interviewSchema.index({ status: 1, startAt: 1, endAt: 1 })
// Recruiter-scoped equivalent of the index above — supports the same overlap query once it's
// additionally filtered by recruiterId (per-recruiter conflict detection/availability).
interviewSchema.index({ recruiterId: 1, status: 1, startAt: 1, endAt: 1 })
// Supports candidate-management lookups/search (Phase E).
// Compound with startAt so listInterviewsForCandidate's sort ({startAt: -1}) is served by the
// index too, not just the filter — candidateEmail alone would still require an in-memory sort.
interviewSchema.index({ candidateEmail: 1, startAt: -1 })
// Supports the authenticated "my interviews" list (interviews.route.ts), sorted newest-first.
interviewSchema.index({ userId: 1, startAt: -1 })
// Sparse: most interviews have no meeting (phone/onsite/custom). Supports
// getInterviewByMeetingId (interview.service.ts), the lookup every Meeting Room join hits —
// without this it's a full collection scan on every candidate/interviewer joining a call.
interviewSchema.index({ 'meeting.meetingId': 1 }, { sparse: true })

/** The plain data shape (used for `.lean()` query results) — no `_id`, no instance methods. */
export type InterviewAttrs = InferSchemaType<typeof interviewSchema>
/** A real Mongoose document instance — has `_id`, `.save()`, etc. Use this everywhere a hydrated document is expected. */
export type InterviewDocument = HydratedDocument<InterviewAttrs>
// Collection is explicitly named `interviews` (not the Mongoose-pluralized default derived
// from the model name, which would already be "interviews" here anyway, but pinning it
// explicitly documents the rename from the original `appointments` collection — see
// server/src/scripts/migrate-appointments-to-interviews.ts).
export const InterviewModel = model('Interview', interviewSchema, 'interviews')
