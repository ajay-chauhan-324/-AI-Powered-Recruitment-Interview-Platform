import { apiPost } from '@/lib/apiClient'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiInterviewSummary {
  id: string
  startAt?: string
  endAt?: string
  status: string
}

export type AiAction =
  | { type: 'availability'; available: boolean; alternatives?: Array<{ start: string; end: string }> }
  | { type: 'slots'; slots: Array<{ start: string; end: string }> }
  | { type: 'interview_created'; interview: AiInterviewSummary; manageToken?: string }
  | { type: 'interview_updated'; interview: AiInterviewSummary }
  | { type: 'interview_cancelled'; interview: AiInterviewSummary }
  | { type: 'blocked_slot_created'; blockedSlot: { id: string; label: string; startAt: string; endAt: string } }

export interface AiChatResponse {
  reply: string
  actions: AiAction[]
}

export function sendAiChat(messages: ConversationTurn[], timezone: string, manageToken?: string): Promise<AiChatResponse> {
  return apiPost('/ai/chat', { messages, timezone, manageToken })
}
