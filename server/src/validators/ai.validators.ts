import { z } from 'zod'
import { timezoneSchema } from './interview.validators.js'

export const conversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
})

export const aiChatInputSchema = z.object({
  messages: z.array(conversationTurnSchema).min(1).max(20),
  timezone: timezoneSchema,
  // Optional UX hint only — which application the candidate was looking at when they opened
  // the assistant (e.g. from a "Book with AI" button). Never trusted as authorization; every
  // tool that uses it re-verifies the candidate actually owns that application.
  activeApplicationId: z.string().min(1).optional(),
})

/** The public/guest chat endpoint additionally accepts the caller's own manage token —
 * this is what scopes an "act on my interview" tool to the one interview it actually
 * belongs to (see ai/tools.ts's resolveGuestInterviewOrThrow), never a bare interview ID
 * supplied by the client or invented by the model. */
export const guestAiChatInputSchema = aiChatInputSchema.extend({
  manageToken: z.string().min(1).optional(),
})
