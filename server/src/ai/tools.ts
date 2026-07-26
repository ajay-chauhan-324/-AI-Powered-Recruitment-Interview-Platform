import { z } from 'zod'
import {
  cancelInterview,
  createInterview,
  getInterviewByToken,
  listInterviewsInRange,
  rescheduleInterview,
} from '../services/interview.service.js'
import {
  findAvailableSlots,
  findNearestAlternatives,
  isSlotAvailable,
  ScheduleNotConfiguredError,
  type AvailableSlot,
} from '../services/availability.service.js'
import { createBlockedSlot } from '../services/blockedSlot.service.js'
import { InterviewNotFoundError, BookingValidationError, NotFoundError, SlotConflictError } from '../services/booking.errors.js'
import { publicCreateInterviewInputSchema } from '../validators/interview.validators.js'
import { blockedSlotInputSchema } from '../validators/schedule.validators.js'
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

const checkAvailabilityArgsSchema = z.object({
  start: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(24 * 60),
})

const findSlotsArgsSchema = z.object({
  rangeStart: z.coerce.date(),
  rangeEnd: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(24 * 60),
})

const scheduleInterviewArgsSchema = publicCreateInterviewInputSchema

const rescheduleArgsSchema = z.object({
  newStart: z.coerce.date(),
  newDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
})

const listInterviewsArgsSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  interviewType: z
    .enum(['hr_screening', 'technical', 'coding', 'system_design', 'behavioral', 'managerial', 'final', 'panel', 'custom'])
    .optional(),
})

const adminRescheduleArgsSchema = z.object({
  interviewId: z.string().min(1),
  newStart: z.coerce.date(),
  newDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
})

const adminCancelArgsSchema = z.object({ interviewId: z.string().min(1) })

const noArgsSchema = z.object({})

const TOOLS: ToolDefinitionInternal[] = [
  {
    contexts: ['guest', 'admin'],
    definition: {
      name: 'check_availability',
      description: 'Check whether a specific start time and duration is available for an interview. Returns alternatives if not.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time', description: 'ISO 8601 start time' },
          durationMinutes: { type: 'number' },
        },
        required: ['start', 'durationMinutes'],
      },
    },
    argsSchema: checkAvailabilityArgsSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof checkAvailabilityArgsSchema>
      try {
        const available = await isSlotAvailable(args.start, args.durationMinutes)
        if (available) {
          const action = { type: 'availability', available: true }
          return { resultJson: JSON.stringify({ available: true }), action }
        }
        const alternatives = await findNearestAlternatives({ preferredStart: args.start, durationMinutes: args.durationMinutes })
        const action = { type: 'availability', available: false, alternatives: slotsToJson(alternatives) }
        return { resultJson: JSON.stringify({ available: false, alternatives: slotsToJson(alternatives) }), action }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
    contexts: ['guest', 'admin'],
    definition: {
      name: 'find_available_slots',
      description: 'List open interview slots of a given duration within a date range.',
      parameters: {
        type: 'object',
        properties: {
          rangeStart: { type: 'string', format: 'date-time' },
          rangeEnd: { type: 'string', format: 'date-time' },
          durationMinutes: { type: 'number' },
        },
        required: ['rangeStart', 'rangeEnd', 'durationMinutes'],
      },
    },
    argsSchema: findSlotsArgsSchema,
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<typeof findSlotsArgsSchema>
      try {
        const slots = await findAvailableSlots(args)
        const truncated = slots.slice(0, MAX_SLOTS_RETURNED)
        const action = { type: 'slots', slots: slotsToJson(truncated) }
        return {
          resultJson: JSON.stringify({ slots: slotsToJson(truncated), truncated: slots.length > truncated.length }),
          action,
        }
      } catch (error) {
        return { resultJson: JSON.stringify(describeError(error)) }
      }
    },
  },
  {
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
            enum: ['hr_screening', 'technical', 'coding', 'system_design', 'behavioral', 'managerial', 'final', 'panel', 'custom'],
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
        const { interview, manageToken } = await createInterview({ ...args, source: 'ai' })
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
            enum: ['hr_screening', 'technical', 'coding', 'system_design', 'behavioral', 'managerial', 'final', 'panel', 'custom'],
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
