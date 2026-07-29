import { apiPost } from '@/lib/apiClient'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiInterviewSummary {
  id: string
  title?: string
  interviewType?: string
  startAt?: string
  endAt?: string
  timezone?: string
  meetingUrl?: string | null
  status: string
}

export type AiAction =
  | { type: 'availability'; available: boolean; alternatives?: Array<{ start: string; end: string }> }
  | { type: 'slots'; slots: Array<{ start: string; end: string }> }
  | { type: 'interview_created'; interview: AiInterviewSummary; manageToken?: string }
  | { type: 'interview_updated'; interview: AiInterviewSummary }
  | { type: 'interview_cancelled'; interview: AiInterviewSummary }
  | { type: 'blocked_slot_created'; blockedSlot: { id: string; label: string; startAt: string; endAt: string } }
  | { type: 'application_updated'; application: { id: string; status: string } }

export interface AiChatResponse {
  reply: string
  actions: AiAction[]
}

/** A tool-calling conversation turn can legitimately involve several round-trips to the AI
 * provider server-side (up to MAX_TOOL_ITERATIONS in conversation.service.ts) — live testing
 * has seen a single turn take 60-90+ seconds on the configured free-tier model. This is a
 * ceiling for a genuinely stuck request (dropped connection, server crash mid-request), not a
 * timeout for the normal slow case — comfortably above every observed real response time. */
const AI_CHAT_TIMEOUT_MS = 180_000

export function sendAiChat(messages: ConversationTurn[], timezone: string, manageToken?: string): Promise<AiChatResponse> {
  return apiPost('/ai/chat', { messages, timezone, manageToken }, AI_CHAT_TIMEOUT_MS)
}

/** The authenticated candidate assistant (a distinct 'user' AiContext server-side — see
 * server/src/ai/aiContext.ts) — scoped to the signed-in user's own interviews only,
 * verified server-side on every tool call, never by anything in this request body.
 * `activeApplicationId` is an optional UX hint only (e.g. the candidate opened the assistant
 * from a specific application's "Book with AI" button) — every tool still re-verifies
 * ownership server-side regardless of this hint. */
export function sendUserAiChat(messages: ConversationTurn[], timezone: string, activeApplicationId?: string): Promise<AiChatResponse> {
  return apiPost('/my/ai/chat', { messages, timezone, activeApplicationId }, AI_CHAT_TIMEOUT_MS)
}

/** The recruiter assistant (a distinct 'recruiter' AiContext server-side) — scoped to the
 * signed-in recruiter's own jobs and applications only, verified server-side. */
export function sendRecruiterAiChat(messages: ConversationTurn[], timezone: string): Promise<AiChatResponse> {
  return apiPost('/recruiter/ai/chat', { messages, timezone }, AI_CHAT_TIMEOUT_MS)
}
