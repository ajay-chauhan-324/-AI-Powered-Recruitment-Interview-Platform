import { z } from 'zod'
import {
  cancelInterview,
  createInterview,
  findInterviewOwnedByUser,
  getInterviewByToken,
  getInterviewOwnedByRecruiter,
  listInterviewsForRecruiter,
  listInterviewsForUser,
  listInterviewsInRange,
  rescheduleInterview,
} from '../services/interview.service.js'
import {
  findAvailableSlots,
  findNearestAlternatives,
  getEffectiveTimezone,
  isSlotAvailable,
  ScheduleNotConfiguredError,
  type AvailableSlot,
} from '../services/availability.service.js'
import { createBlockedSlot } from '../services/blockedSlot.service.js'
import { InterviewNotFoundError, BookingValidationError, NotFoundError, SlotConflictError } from '../services/booking.errors.js'
import { publicCreateInterviewInputSchema } from '../validators/interview.validators.js'
import { blockedSlotInputSchema } from '../validators/schedule.validators.js'
import { listPublicJobs, getPublishedJobBySlugOrId, listJobsForRecruiter } from '../services/job.service.js'
import {
  getApplicationForCandidate,
  getApplicationForRecruiter,
  listApplicationsForCandidate,
  listApplicationsForRecruiter,
  scheduleApplicationInterview,
  updateApplicationStatus,
} from '../services/application.service.js'
import { APPLICATION_STATUSES, MANUAL_APPLICATION_STATUSES } from '../models/Application.model.js'
import { EMPLOYMENT_TYPES, WORKPLACE_TYPES, JobModel } from '../models/Job.model.js'
import { INTERVIEW_TYPES } from '../models/Interview.model.js'
import { EXPERIENCE_LEVELS } from '../models/User.model.js'
import { FIXED_SCHEDULE_TIMEZONE } from '../config/scheduleDefaults.js'
import { AppError } from '../middleware/errorHandler.js'
import type { AiContext } from './aiContext.js'
import type { AiToolCall, AiToolDefinition } from './providers/types.js'

/** What a tool handler hands back to the conversation loop: `resultJson` is fed to the model
 * as the tool's output; `action` (if present) is surfaced to the frontend as a structured,
 * renderable result (e.g. a confirmed booking, a list of slots to show as chips). */
interface ToolExecutionOutcome {
  resultJson: string
  action?: Record<string, unknown>
}

interface ToolDefinitionInternal {
  contexts: Array<AiContext['mode']>
  definition: AiToolDefinition
  argsSchema: z.ZodType
  handler: (args: unknown, context: AiContext) => Promise<ToolExecutionOutcome>
}

const MAX_SLOTS_RETURNED = 8
const MAX_INTERVIEWS_RETURNED = 50

function slotsToJson(slots: AvailableSlot[]) {
  return slots.map((slot) => ({ start: slot.start.toISOString(), end: slot.end.toISOString() }))
}

/** Maps known business-rule errors to a JSON-safe result the model can reason about and
 * relay in natural language — these are ordinary "no" answers (outside hours, conflict,
 * not found), not server faults, so they're returned as tool output, never thrown. Anything
 * unrecognized is logged and reduced to a generic message (CLAUDE.md §33: never expose
 * internals), mirroring errorHandler.ts's production behavior. */
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof SlotConflictError) {
    return { error: error.message, alternatives: slotsToJson(error.alternatives) }
  }
  if (error instanceof BookingValidationError || error instanceof ScheduleNotConfiguredError) {
    return { error: error.message }
  }
  if (error instanceof NotFoundError) {
    return { error: error.message }
  }
  // AppError messages thrown by the application/job services (e.g. "This application has no
  // interview round ready to book.", "Job not found.") are already written as user-safe,
  // conversational text — the same messages the REST controllers return directly to the
  // client — so it's safe to relay them to the model verbatim, same as the booking-domain
  // errors above.
  if (error instanceof AppError) {
    return { error: error.message }
  }
  console.error('[ai] unexpected tool execution error:', error)
  return { error: 'Something went wrong performing that action.' }
}

/** Guest tools resolve the target interview from the server-held manage token ONLY — never
 * from an interview ID the model might pass along. This is the actual authorization
 * boundary; the system prompt's instructions support it but this is what enforces it. */
async function resolveGuestInterviewOrThrow(context: AiContext) {
  if (context.mode !== 'guest' || !context.manageToken) {
    throw new NotFoundError('No interview is associated with this conversation.')
  }
  const interview = await getInterviewByToken(context.manageToken)
  if (!interview) throw new InterviewNotFoundError()
  return interview
}

/** The user-scoped equivalent of resolveGuestInterviewOrThrow: the model may pass any
 * interviewId it likes, but the lookup is always re-scoped to the authenticated user's own
 * records (userId or matching candidateEmail) server-side — this is the actual IDOR
 * boundary, not just a system-prompt instruction. */
async function resolveUserInterviewOrThrow(context: AiContext, interviewId: string) {
  if (context.mode !== 'user') {
    throw new NotFoundError('No interview is associated with this conversation.')
  }
  const interview = await findInterviewOwnedByUser(interviewId, context.userId, context.email)
  if (!interview) throw new InterviewNotFoundError()
  return interview
}

const checkAvailabilityArgsSchema = z.object({
  start: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(24 * 60),
  applicationId: z.string().min(1).optional(),
})

const findSlotsArgsSchema = z.object({
  rangeStart: z.coerce.date(),
  rangeEnd: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(24 * 60),
  applicationId: z.string().min(1).optional(),
})

/**
 * Every recruiter now owns their own calendar (CLAUDE.md §36 second pivot), so
 * check_availability/find_available_slots must know WHICH recruiter's calendar a signed-in
 * candidate means — resolved here from an application the candidate actually owns (re-
 * verified through getApplicationForCandidate, the same IDOR boundary every other candidate
 * tool uses), never guessed or left to whichever calendar happens to be "the" one. guest/
 * admin conversations are untouched: they keep checking the legacy global calendar (the
 * original generic/admin booking product, CLAUDE.md §36.9), since that product never had a
 * notion of "which recruiter" to begin with.
 */
async function resolveRecruiterIdForAvailability(context: AiContext, applicationId?: string): Promise<string | undefined> {
  if (context.mode !== 'user') return undefined
  const effectiveApplicationId = applicationId ?? context.activeApplicationId
  if (!effectiveApplicationId) {
    throw new BookingValidationError(
      'Which application is this about? Call find_bookable_interview_rounds or list_my_applications first, then pass applicationId so I can check the right recruiter\'s calendar.',
    )
  }
  const application = await getApplicationForCandidate(context.userId, effectiveApplicationId)
  const job = await JobModel.findById(application.jobId).select('recruiterId')
  if (!job) throw new NotFoundError('Job not found.')
  return job.recruiterId.toString()
}

/** Resolves which application a booking/availability tool call means: an explicit argument
 * wins, then the conversation's activeApplicationId hint (set when the candidate opened the
 * assistant from a specific application's "Book with AI" button) — never guessed beyond
 * that. Callers must still fall back to asking the candidate (via
 * find_bookable_interview_rounds) when this returns undefined. */
function resolveApplicationId(context: AiContext, applicationId?: string): string | undefined {
  if (context.mode !== 'user') return applicationId
  return applicationId ?? context.activeApplicationId
}

const scheduleInterviewArgsSchema = publicCreateInterviewInputSchema

const rescheduleArgsSchema = z.object({
  newStart: z.coerce.date(),
  newDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
})

const listInterviewsArgsSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  interviewType: z.enum(INTERVIEW_TYPES).optional(),
})

const adminRescheduleArgsSchema = z.object({
  interviewId: z.string().min(1),
  newStart: z.coerce.date(),
  newDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
})

const adminCancelArgsSchema = z.object({ interviewId: z.string().min(1) })

const userInterviewIdArgsSchema = z.object({ interviewId: z.string().min(1) })

const userRescheduleArgsSchema = z.object({
  interviewId: z.string().min(1),
  newStart: z.coerce.date(),
  newDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
})

const noArgsSchema = z.object({})

const MAX_JOBS_RETURNED = 8

const findJobsArgsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  workplaceType: z.enum(WORKPLACE_TYPES).optional(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  location: z.string().trim().max(200).optional(),
})

const jobIdArgsSchema = z.object({ jobId: z.string().min(1) })
const applicationIdArgsSchema = z.object({ applicationId: z.string().min(1) })

const bookInterviewRoundArgsSchema = z.object({
  applicationId: z.string().min(1).optional(),
  startAt: z.coerce.date(),
})

const listJobApplicationsArgsSchema = z.object({
  jobId: z.string().min(1).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  skill: z.string().trim().min(1).max(60).optional(),
  limit: z.number().int().positive().max(50).optional(),
})

const recruiterListInterviewsArgsSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

const recruiterInterviewIdArgsSchema = z.object({ interviewId: z.string().min(1) })

const recruiterRescheduleArgsSchema = z.object({
  interviewId: z.string().min(1),
  newStart: z.coerce.date(),
})
const updateApplicationStatusArgsSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(MANUAL_APPLICATION_STATUSES),
})

const TOOLS: ToolDefinitionInternal[] = [
  {
    contexts: ['guest', 'admin', 'user'],
    definition: {
      name: 'check_availability',
      description:
        'Check whether a specific start time and duration is available for an interview. Returns alternatives if not. If you are assisting a signed-in candidate, pass applicationId (from find_bookable_interview_rounds/list_my_applications) so the right recruiter\'s calendar is checked — every recruiter has their own hours. May be omitted only if there is already an unambiguous active application in this conversation.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time', description: 'ISO 8601 start time' },
          durationMinutes: { type: 'number' },
          applicationId: { type: 'string', description: 'For a signed-in candidate — identifies whose calendar to check' },
        },
        required: ['start', 'durationMinutes'],
      },
    },
    argsSchema: checkAvailabilityArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof checkAvailabilityArgsSchema>
      try {
        const recruiterId = await resolveRecruiterIdForAvailability(context, args.applicationId)
        const timezone = await getEffectiveTimezone(recruiterId)
        const available = await isSlotAvailable(args.start, args.durationMinutes, undefined, undefined, recruiterId)
        if (available) {
          const action = { type: 'availability', available: true }
          return { resultJson: JSON.stringify({ available: true, timezone }), action }
        }
        const alternatives = await findNearestAlternatives({
          preferredStart: args.start,
          durationMinutes: args.durationMinutes,
          recruiterId,
        })
        const action = { type: 'availability', available: false, alternatives: slotsToJson(alternatives) }
        return { resultJson: JSON.stringify({ available: false, alternatives: slotsToJson(alternatives), timezone }), action }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['guest', 'admin', 'user'],
    definition: {
      name: 'find_available_slots',
      description:
        'List open interview slots of a given duration within a date range. If you are assisting a signed-in candidate, pass applicationId (from find_bookable_interview_rounds/list_my_applications) so the right recruiter\'s calendar is checked — every recruiter has their own hours. May be omitted only if there is already an unambiguous active application in this conversation.',
      parameters: {
        type: 'object',
        properties: {
          rangeStart: { type: 'string', format: 'date-time' },
          rangeEnd: { type: 'string', format: 'date-time' },
          durationMinutes: { type: 'number' },
          applicationId: { type: 'string', description: 'Required for a signed-in candidate — identifies whose calendar to check' },
        },
        required: ['rangeStart', 'rangeEnd', 'durationMinutes'],
      },
    },
    argsSchema: findSlotsArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof findSlotsArgsSchema>
      try {
        const recruiterId = await resolveRecruiterIdForAvailability(context, args.applicationId)
        const timezone = await getEffectiveTimezone(recruiterId)
        const slots = await findAvailableSlots({ ...args, recruiterId })
        const truncated = slots.slice(0, MAX_SLOTS_RETURNED)
        const action = { type: 'slots', slots: slotsToJson(truncated) }
        return {
          resultJson: JSON.stringify({
            slots: slotsToJson(truncated),
            truncated: slots.length > truncated.length,
            timezone,
          }),
          action,
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    // 'user' (signed-in candidate) deliberately excluded — no tool books a new interview for a
    // signed-in candidate at all (this product's "AI is never responsible for booking"
    // decision). A candidate's round-based booking now happens only through the real
    // Interview Scheduler dialog (client), which calls the same REST endpoint directly.
    contexts: ['guest', 'admin'],
    definition: {
      name: 'schedule_interview',
      description:
        "Book a new interview. Always confirm availability with the user before calling this, and collect the candidate's name and email first.",
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          interviewType: {
            type: 'string',
            enum: [...INTERVIEW_TYPES],
          },
          round: { type: 'number' },
          locationType: { type: 'string', enum: ['video', 'phone', 'onsite', 'custom'] },
          candidateName: { type: 'string' },
          candidateEmail: { type: 'string' },
          startAt: { type: 'string', format: 'date-time' },
          durationMinutes: { type: 'number' },
          timezone: { type: 'string', description: 'IANA timezone, e.g. America/New_York' },
        },
        required: ['title', 'candidateName', 'candidateEmail', 'startAt', 'durationMinutes', 'timezone'],
      },
    },
    argsSchema: scheduleInterviewArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof scheduleInterviewArgsSchema>
      try {
        // Every interview runs on the one fixed IST schedule (scheduleDefaults.ts) — never
        // trust a timezone the model supplied, even though the schema still accepts one.
        const { interview, manageToken } = await createInterview({ ...args, timezone: FIXED_SCHEDULE_TIMEZONE, source: 'ai' })
        const summary = {
          id: interview._id.toString(),
          title: interview.title,
          interviewType: interview.interviewType,
          startAt: interview.startAt.toISOString(),
          endAt: interview.endAt.toISOString(),
          status: interview.status,
        }
        const action = {
          type: 'interview_created',
          interview: summary,
          ...(context.mode === 'guest' ? { manageToken } : {}),
        }
        return { resultJson: JSON.stringify({ ...summary, booked: true }), action }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['guest'],
    definition: {
      name: 'get_my_interview',
      description: "Look up the details of the interview already associated with this conversation, if any.",
      parameters: { type: 'object', properties: {} },
    },
    argsSchema: noArgsSchema,
    handler: async (_rawArgs, context) => {
      try {
        const interview = await resolveGuestInterviewOrThrow(context)
        return {
          resultJson: JSON.stringify({
            id: interview._id.toString(),
            title: interview.title,
            interviewType: interview.interviewType,
            round: interview.round,
            startAt: interview.startAt.toISOString(),
            endAt: interview.endAt.toISOString(),
            status: interview.status,
          }),
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['guest'],
    definition: {
      name: 'reschedule_my_interview',
      description: "Reschedule the interview already associated with this conversation to a new time.",
      parameters: {
        type: 'object',
        properties: {
          newStart: { type: 'string', format: 'date-time' },
          newDurationMinutes: { type: 'number' },
        },
        required: ['newStart'],
      },
    },
    argsSchema: rescheduleArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof rescheduleArgsSchema>
      try {
        const existing = await resolveGuestInterviewOrThrow(context)
        const updated = await rescheduleInterview(existing._id.toString(), args.newStart, args.newDurationMinutes)
        const summary = {
          id: updated._id.toString(),
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
          status: updated.status,
        }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_updated', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['guest'],
    definition: {
      name: 'cancel_my_interview',
      description: "Cancel the interview already associated with this conversation.",
      parameters: { type: 'object', properties: {} },
    },
    argsSchema: noArgsSchema,
    handler: async (_rawArgs, context) => {
      try {
        const existing = await resolveGuestInterviewOrThrow(context)
        const cancelled = await cancelInterview(existing._id.toString())
        const summary = { id: cancelled._id.toString(), status: cancelled.status }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_cancelled', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'list_my_interviews',
      description:
        "List the signed-in candidate's own interviews. Pass upcoming: true to only see future, non-cancelled interviews (e.g. for \"what's my next interview\").",
      parameters: {
        type: 'object',
        properties: { upcoming: { type: 'boolean', description: 'Only future, non-cancelled interviews' } },
      },
    },
    argsSchema: z.object({ upcoming: z.boolean().optional() }),
    handler: async (rawArgs, context) => {
      if (context.mode !== 'user') {
        return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      }
      const args = rawArgs as { upcoming?: boolean }
      try {
        const now = new Date()
        const all = await listInterviewsForUser(context.userId, context.email)
        const interviews = args.upcoming
          ? all.filter((interview) => interview.startAt > now && interview.status !== 'cancelled')
          : all
        const truncated = interviews.slice(0, MAX_INTERVIEWS_RETURNED)
        const summaries = truncated.map((interview) => ({
          id: interview._id.toString(),
          title: interview.title,
          interviewType: interview.interviewType,
          startAt: interview.startAt.toISOString(),
          endAt: interview.endAt.toISOString(),
          status: interview.status,
          meetingUrl: interview.meetingUrl || null,
        }))
        return { resultJson: JSON.stringify({ interviews: summaries }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'get_my_interview_by_id',
      description: "Look up full details of one of the signed-in candidate's own interviews by its id (from list_my_interviews).",
      parameters: {
        type: 'object',
        properties: { interviewId: { type: 'string' } },
        required: ['interviewId'],
      },
    },
    argsSchema: userInterviewIdArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof userInterviewIdArgsSchema>
      try {
        const interview = await resolveUserInterviewOrThrow(context, args.interviewId)
        return {
          resultJson: JSON.stringify({
            id: interview._id.toString(),
            title: interview.title,
            interviewType: interview.interviewType,
            round: interview.round,
            startAt: interview.startAt.toISOString(),
            endAt: interview.endAt.toISOString(),
            status: interview.status,
            meetingUrl: interview.meetingUrl || null,
          }),
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'reschedule_my_interview_by_id',
      description: "Reschedule one of the signed-in candidate's own interviews (by id) to a new time.",
      parameters: {
        type: 'object',
        properties: {
          interviewId: { type: 'string' },
          newStart: { type: 'string', format: 'date-time' },
          newDurationMinutes: { type: 'number' },
        },
        required: ['interviewId', 'newStart'],
      },
    },
    argsSchema: userRescheduleArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof userRescheduleArgsSchema>
      try {
        const existing = await resolveUserInterviewOrThrow(context, args.interviewId)
        const updated = await rescheduleInterview(existing._id.toString(), args.newStart, args.newDurationMinutes)
        const summary = {
          id: updated._id.toString(),
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
          status: updated.status,
        }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_updated', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'cancel_my_interview_by_id',
      description: "Cancel one of the signed-in candidate's own interviews by id.",
      parameters: {
        type: 'object',
        properties: { interviewId: { type: 'string' } },
        required: ['interviewId'],
      },
    },
    argsSchema: userInterviewIdArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof userInterviewIdArgsSchema>
      try {
        const existing = await resolveUserInterviewOrThrow(context, args.interviewId)
        const cancelled = await cancelInterview(existing._id.toString())
        const summary = { id: cancelled._id.toString(), status: cancelled.status }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_cancelled', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'get_application_rounds',
      description:
        "Look up the interview pipeline (all rounds, in order) for one of the signed-in candidate's own applications (from list_my_applications) — shows which round, if any, is ready to book (status 'ready_to_book'), which are locked, and which are already scheduled/passed/failed, plus the meeting link once scheduled. Use this to answer \"is my interview ready to book\" or \"where is my meeting\" — but never book it yourself; tell the candidate to use the Book Interview button on their application, which opens the real scheduler.",
      parameters: {
        type: 'object',
        properties: { applicationId: { type: 'string' } },
        required: ['applicationId'],
      },
    },
    argsSchema: applicationIdArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof applicationIdArgsSchema>
      if (context.mode !== 'user') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        const application = await getApplicationForCandidate(context.userId, args.applicationId)
        const rounds = application.rounds.map((round) => ({
          order: round.order,
          type: round.type,
          title: round.title,
          durationMinutes: round.durationMinutes,
          instructions: round.instructions,
          status: round.status,
          meetingUrl: round.meetingUrl || null,
        }))
        return { resultJson: JSON.stringify({ applicationStatus: application.status, rounds }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'find_bookable_interview_rounds',
      description:
        'List every interview round currently ready to book, across ALL of the signed-in candidate\'s applications (job title, company, round type/title, duration, applicationId). Call this FIRST when a candidate says something like "I want to book my interview" without naming a specific job or application — if it returns exactly one round, proceed with that one directly; if it returns more than one, ask the candidate which role they mean before checking availability or booking; if it returns none, tell them there is nothing ready to book right now.',
      parameters: { type: 'object', properties: {} },
    },
    argsSchema: noArgsSchema,
    handler: async (_rawArgs, context) => {
      if (context.mode !== 'user') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        const applications = await listApplicationsForCandidate(context.userId)
        const bookable = applications.flatMap((application) => {
          const job = application.jobId as unknown as { title?: string; companyId?: { name?: string } } | null
          return application.rounds
            .filter((round) => round.status === 'ready_to_book')
            .map((round) => ({
              applicationId: application._id.toString(),
              jobTitle: job?.title ?? '',
              companyName: job?.companyId?.name ?? '',
              round: round.order,
              interviewType: round.type,
              title: round.title,
              durationMinutes: round.durationMinutes,
            }))
        })
        return { resultJson: JSON.stringify({ bookableRounds: bookable }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    // The primary, and only, way a signed-in candidate's round gets booked (this product's
    // "the entire booking flow happens through AI chat" decision) — reuses the exact same
    // conflict-safe scheduleApplicationInterview every REST-driven booking path (and the
    // legacy manual scheduler dialog, kept only as a secondary/debug surface) already calls.
    // Never invents a slot: startAt must be one the model already learned about from
    // check_availability/find_available_slots in this same conversation.
    contexts: ['user'],
    definition: {
      name: 'book_interview_round',
      description:
        'Books the interview round currently ready to book for the given application, at the given start time. applicationId may be omitted if there is exactly one unambiguous application in context (e.g. from find_bookable_interview_rounds returning one result, or the conversation already has an active application). ALWAYS confirm availability with check_availability or find_available_slots first — never call this with a time you have not already confirmed is open. If this reports a conflict, the slot was just taken by someone else — never treat that as a failure; immediately offer the alternatives included in the result.',
      parameters: {
        type: 'object',
        properties: {
          applicationId: { type: 'string', description: 'Omit only if unambiguous from context' },
          startAt: { type: 'string', format: 'date-time' },
        },
        required: ['startAt'],
      },
    },
    argsSchema: bookInterviewRoundArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof bookInterviewRoundArgsSchema>
      if (context.mode !== 'user') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      const applicationId = resolveApplicationId(context, args.applicationId)
      if (!applicationId) {
        return {
          resultJson: JSON.stringify({
            error: 'Which application is this for? Call find_bookable_interview_rounds first if you\'re not sure.',
          }),
        }
      }
      try {
        // scheduleApplicationInterview's 4th parameter is a vestigial, deliberately-unused
        // timezone argument — the actual booking always uses the owning recruiter's own
        // calendar timezone, never a caller-supplied one (see application.service.ts).
        const { interview, manageToken } = await scheduleApplicationInterview(
          context.userId,
          applicationId,
          args.startAt,
          '',
        )
        const summary = {
          id: interview._id.toString(),
          title: interview.title,
          interviewType: interview.interviewType,
          startAt: interview.startAt.toISOString(),
          endAt: interview.endAt.toISOString(),
          timezone: interview.timezone,
          meetingUrl: interview.meetingUrl || null,
          status: interview.status,
        }
        return {
          resultJson: JSON.stringify({ ...summary, booked: true }),
          action: { type: 'interview_created', interview: summary, manageToken },
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['admin'],
    definition: {
      name: 'list_interviews',
      description:
        'List interviews (any status, full detail) within a date range, optionally filtered by interview type — use this to answer questions like "how many technical interviews this week" by counting the returned items.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          interviewType: {
            type: 'string',
            enum: [...INTERVIEW_TYPES],
          },
        },
        required: ['from', 'to'],
      },
    },
    argsSchema: listInterviewsArgsSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof listInterviewsArgsSchema>
      try {
        const interviews = await listInterviewsInRange(args.from, args.to)
        const filtered = args.interviewType
          ? interviews.filter((interview) => interview.interviewType === args.interviewType)
          : interviews
        const truncated = filtered.slice(0, MAX_INTERVIEWS_RETURNED)
        const summaries = truncated.map((interview) => ({
          id: interview._id.toString(),
          title: interview.title,
          interviewType: interview.interviewType,
          candidateName: interview.candidateName,
          startAt: interview.startAt.toISOString(),
          endAt: interview.endAt.toISOString(),
          status: interview.status,
        }))
        return {
          resultJson: JSON.stringify({
            interviews: summaries,
            totalMatching: filtered.length,
            truncated: filtered.length > truncated.length,
          }),
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['admin'],
    definition: {
      name: 'reschedule_interview_by_id',
      description: 'Reschedule any interview by its ID.',
      parameters: {
        type: 'object',
        properties: {
          interviewId: { type: 'string' },
          newStart: { type: 'string', format: 'date-time' },
          newDurationMinutes: { type: 'number' },
        },
        required: ['interviewId', 'newStart'],
      },
    },
    argsSchema: adminRescheduleArgsSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof adminRescheduleArgsSchema>
      try {
        const updated = await rescheduleInterview(args.interviewId, args.newStart, args.newDurationMinutes)
        const summary = {
          id: updated._id.toString(),
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
          status: updated.status,
        }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_updated', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['admin'],
    definition: {
      name: 'cancel_interview_by_id',
      description: 'Cancel any interview by its ID.',
      parameters: {
        type: 'object',
        properties: { interviewId: { type: 'string' } },
        required: ['interviewId'],
      },
    },
    argsSchema: adminCancelArgsSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof adminCancelArgsSchema>
      try {
        const cancelled = await cancelInterview(args.interviewId)
        const summary = { id: cancelled._id.toString(), status: cancelled.status }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_cancelled', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['guest', 'user'],
    definition: {
      name: 'find_jobs',
      description: 'Search published job postings by keyword, employment type, workplace type, experience level, or location.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Free-text search across title and skills' },
          employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
          workplaceType: { type: 'string', enum: [...WORKPLACE_TYPES] },
          experienceLevel: { type: 'string', enum: [...EXPERIENCE_LEVELS] },
          location: { type: 'string' },
        },
      },
    },
    argsSchema: findJobsArgsSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof findJobsArgsSchema>
      try {
        const { jobs, total } = await listPublicJobs({ ...args, page: 1, limit: MAX_JOBS_RETURNED })
        const summaries = jobs.map((job) => ({
          id: job._id.toString(),
          slug: job.slug,
          title: job.title,
          employmentType: job.employmentType,
          workplaceType: job.workplaceType,
          location: job.location,
          experienceLevel: job.experienceLevel,
          requiredSkills: job.requiredSkills,
        }))
        return { resultJson: JSON.stringify({ jobs: summaries, totalMatching: total }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['guest', 'user'],
    definition: {
      name: 'get_job_details',
      description: 'Look up full details of one published job by its id or slug (from find_jobs).',
      parameters: {
        type: 'object',
        properties: { jobId: { type: 'string' } },
        required: ['jobId'],
      },
    },
    argsSchema: jobIdArgsSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof jobIdArgsSchema>
      try {
        const job = await getPublishedJobBySlugOrId(args.jobId)
        if (!job) return { resultJson: JSON.stringify({ error: 'Job not found or no longer published.' }) }
        return {
          resultJson: JSON.stringify({
            id: job._id.toString(),
            title: job.title,
            description: job.description,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
            location: job.location,
            experienceLevel: job.experienceLevel,
            minExperienceYears: job.minExperienceYears,
            requiredSkills: job.requiredSkills,
            preferredSkills: job.preferredSkills,
            educationRequirement: job.educationRequirement,
          }),
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'list_my_applications',
      description:
        "List the signed-in candidate's own job applications and their status. Pass status to filter (e.g. 'rejected' for rejected jobs, 'shortlisted' for shortlisted jobs).",
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', enum: [...APPLICATION_STATUSES] } },
      },
    },
    argsSchema: z.object({ status: z.enum(APPLICATION_STATUSES).optional() }),
    handler: async (rawArgs, context) => {
      if (context.mode !== 'user') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      const args = rawArgs as { status?: (typeof APPLICATION_STATUSES)[number] }
      try {
        const all = await listApplicationsForCandidate(context.userId)
        const applications = args.status ? all.filter((application) => application.status === args.status) : all
        // jobTitle/companyName let the model match a candidate's natural-language reference
        // ("my Frontend Engineer application at Acme") to the right applicationId — without
        // these, every application looks identical except for its opaque id. A candidate's own
        // AI match score/analysis is never surfaced here — same rule as the REST API's
        // toCandidateJson (applications.controller.ts) — it's recruiter-only.
        const summaries = applications.map((application) => {
          const job = application.jobId as unknown as { title?: string; companyId?: { name?: string } } | null
          return {
            id: application._id.toString(),
            jobTitle: job?.title ?? '',
            companyName: job?.companyId?.name ?? '',
            status: application.status,
          }
        })
        return { resultJson: JSON.stringify({ applications: summaries }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['user'],
    definition: {
      name: 'explain_application_status',
      description:
        "Explain the status and interview-round progress of one of the signed-in candidate's own applications (from list_my_applications). This never includes the candidate's own AI match score or analysis — that is recruiter-only, matching the REST API.",
      parameters: {
        type: 'object',
        properties: { applicationId: { type: 'string' } },
        required: ['applicationId'],
      },
    },
    argsSchema: applicationIdArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof applicationIdArgsSchema>
      if (context.mode !== 'user') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        // A candidate's own AI match score/strengths/gaps are never surfaced here — same rule
        // as the REST API's toCandidateJson (applications.controller.ts) — it's recruiter-only.
        const application = await getApplicationForCandidate(context.userId, args.applicationId)
        return {
          resultJson: JSON.stringify({
            status: application.status,
            rounds: application.rounds.map((round) => ({
              order: round.order,
              type: round.type,
              title: round.title,
              status: round.status,
            })),
          }),
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['admin'],
    definition: {
      name: 'create_blocked_slot',
      description: 'Block off a period of time (e.g. "Block Friday afternoon") so it cannot be booked.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
        },
        required: ['label', 'startAt', 'endAt'],
      },
    },
    argsSchema: blockedSlotInputSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof blockedSlotInputSchema>
      try {
        const created = await createBlockedSlot(args)
        const summary = {
          id: created._id.toString(),
          label: created.label,
          startAt: created.startAt.toISOString(),
          endAt: created.endAt.toISOString(),
        }
        return { resultJson: JSON.stringify(summary), action: { type: 'blocked_slot_created', blockedSlot: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['recruiter'],
    definition: {
      name: 'list_recruiter_jobs',
      description: "List the signed-in recruiter's own jobs (any status).",
      parameters: { type: 'object', properties: {} },
    },
    argsSchema: noArgsSchema,
    handler: async (_rawArgs, context) => {
      if (context.mode !== 'recruiter') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        const jobs = await listJobsForRecruiter(context.userId)
        const summaries = jobs.map((job) => ({
          id: job._id.toString(),
          title: job.title,
          status: job.status,
          employmentType: job.employmentType,
        }))
        return { resultJson: JSON.stringify({ jobs: summaries }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['recruiter'],
    definition: {
      name: 'list_job_applications',
      description:
        "List applications across the signed-in recruiter's own jobs, always sorted by AI match score (highest first) — use this to answer \"best candidate\", \"top N candidates\", \"best React candidate\"/\"AWS candidates\" (skill), or \"who's waiting for review\" (status: under_review). Pass jobId to scope to one job (from list_recruiter_jobs), or omit it to search across every job at once. Pass limit for \"top N\".",
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Optional — omit to search across all of this recruiter\'s jobs' },
          status: { type: 'string', enum: [...APPLICATION_STATUSES] },
          skill: { type: 'string', description: 'Filter to candidates with this skill, e.g. "React" or "AWS"' },
          limit: { type: 'number', description: 'Return only the top N (already sorted by match score)' },
        },
      },
    },
    argsSchema: listJobApplicationsArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof listJobApplicationsArgsSchema>
      if (context.mode !== 'recruiter') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        const applications = await listApplicationsForRecruiter(context.userId, args)
        const summaries = applications.map((application) => {
          const candidate = application.candidateId as unknown as { name?: string } | null
          const job = application.jobId as unknown as { title?: string } | null
          return {
            id: application._id.toString(),
            candidateName: candidate && typeof candidate === 'object' ? (candidate.name ?? '') : '',
            jobTitle: job && typeof job === 'object' ? (job.title ?? '') : '',
            status: application.status,
            atsScore: application.atsAnalysis?.score ?? null,
          }
        })
        return { resultJson: JSON.stringify({ applications: summaries }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['recruiter'],
    definition: {
      name: 'list_recruiter_interviews',
      description:
        "List interviews booked against the signed-in recruiter's own jobs within a date range — use this for \"today's interviews\" or \"tomorrow's interviews\".",
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
        required: ['from', 'to'],
      },
    },
    argsSchema: recruiterListInterviewsArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof recruiterListInterviewsArgsSchema>
      if (context.mode !== 'recruiter') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        const all = await listInterviewsForRecruiter(context.userId)
        const inRange = all.filter((interview) => interview.startAt < args.to && interview.endAt > args.from)
        const truncated = inRange.slice(0, MAX_INTERVIEWS_RETURNED)
        const summaries = truncated.map((interview) => ({
          id: interview._id.toString(),
          title: interview.title,
          interviewType: interview.interviewType,
          candidateName: interview.candidateName,
          startAt: interview.startAt.toISOString(),
          endAt: interview.endAt.toISOString(),
          status: interview.status,
        }))
        return { resultJson: JSON.stringify({ interviews: summaries, totalMatching: inRange.length }) }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['recruiter'],
    definition: {
      name: 'reschedule_recruiter_interview_by_id',
      description: "Reschedule an interview booked against one of the signed-in recruiter's own jobs (from list_recruiter_interviews), by id.",
      parameters: {
        type: 'object',
        properties: {
          interviewId: { type: 'string' },
          newStart: { type: 'string', format: 'date-time' },
        },
        required: ['interviewId', 'newStart'],
      },
    },
    argsSchema: recruiterRescheduleArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof recruiterRescheduleArgsSchema>
      if (context.mode !== 'recruiter') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        await getInterviewOwnedByRecruiter(context.userId, args.interviewId)
        const updated = await rescheduleInterview(args.interviewId, args.newStart)
        const summary = {
          id: updated._id.toString(),
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
          status: updated.status,
        }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_updated', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['recruiter'],
    definition: {
      name: 'cancel_recruiter_interview_by_id',
      description: "Cancel an interview booked against one of the signed-in recruiter's own jobs (from list_recruiter_interviews), by id.",
      parameters: {
        type: 'object',
        properties: { interviewId: { type: 'string' } },
        required: ['interviewId'],
      },
    },
    argsSchema: recruiterInterviewIdArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof recruiterInterviewIdArgsSchema>
      if (context.mode !== 'recruiter') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        await getInterviewOwnedByRecruiter(context.userId, args.interviewId)
        const cancelled = await cancelInterview(args.interviewId)
        const summary = { id: cancelled._id.toString(), status: cancelled.status }
        return { resultJson: JSON.stringify(summary), action: { type: 'interview_cancelled', interview: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['recruiter'],
    definition: {
      name: 'summarize_application',
      description: 'Summarize one application: candidate profile and AI job-fit analysis (from list_job_applications).',
      parameters: {
        type: 'object',
        properties: { applicationId: { type: 'string' } },
        required: ['applicationId'],
      },
    },
    argsSchema: applicationIdArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof applicationIdArgsSchema>
      if (context.mode !== 'recruiter') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        const application = await getApplicationForRecruiter(context.userId, args.applicationId)
        const candidate = application.candidateId as unknown as {
          name?: string
          headline?: string
          skills?: string[]
          experienceLevel?: string
        } | null
        return {
          resultJson: JSON.stringify({
            candidateName: candidate?.name ?? '',
            candidateHeadline: candidate?.headline ?? '',
            candidateSkills: candidate?.skills ?? [],
            candidateExperienceLevel: candidate?.experienceLevel ?? null,
            status: application.status,
            atsAnalysis: application.atsAnalysis,
            recruiterNotes: application.recruiterNotes,
          }),
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['recruiter'],
    definition: {
      name: 'update_application_status',
      description:
        "Move an application to a new manually-set status (under_review, shortlisted, rejected, withdrawn) — status changes driven by interview rounds (interviewing, selected) happen only through round actions, never this tool. Setting 'shortlisted' automatically unlocks the candidate's first interview round for booking — there is no separate unlock step or tool.",
      parameters: {
        type: 'object',
        properties: {
          applicationId: { type: 'string' },
          status: { type: 'string', enum: [...MANUAL_APPLICATION_STATUSES] },
        },
        required: ['applicationId', 'status'],
      },
    },
    argsSchema: updateApplicationStatusArgsSchema,
    handler: async (rawArgs, context) => {
      const args = rawArgs as z.infer<typeof updateApplicationStatusArgsSchema>
      if (context.mode !== 'recruiter') return { resultJson: JSON.stringify({ error: 'Not available in this conversation.' }) }
      try {
        const application = await updateApplicationStatus(context.userId, args.applicationId, args.status)
        const summary = { id: application._id.toString(), status: application.status }
        return { resultJson: JSON.stringify(summary), action: { type: 'application_updated', application: summary } }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
]

export function getToolsForContext(mode: AiContext['mode']): AiToolDefinition[] {
  return TOOLS.filter((tool) => tool.contexts.includes(mode)).map((tool) => tool.definition)
}

export async function executeTool(call: AiToolCall, context: AiContext): Promise<ToolExecutionOutcome> {
  const tool = TOOLS.find((candidate) => candidate.definition.name === call.name)
  if (!tool || !tool.contexts.includes(context.mode)) {
    return { resultJson: JSON.stringify({ error: `Tool "${call.name}" is not available.` }) }
  }

  let rawArgs: unknown
  try {
    rawArgs = call.argumentsJson.trim().length > 0 ? JSON.parse(call.argumentsJson) : {}
  } catch {
    return { resultJson: JSON.stringify({ error: 'Tool arguments were not valid JSON.' }) }
  }

  const parsed = tool.argsSchema.safeParse(rawArgs)
  if (!parsed.success) {
    return { resultJson: JSON.stringify({ error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join('; ')}` }) }
  }

  return tool.handler(parsed.data, context)
}
