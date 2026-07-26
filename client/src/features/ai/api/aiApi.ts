import { apiPost } from '@/lib/apiClient'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiAppointmentSummary {
  id: string
  startAt?: string
  endAt?: string
  status: string
}

export type AiAction =
  | { type: 'availability'; available: boolean; alternatives?: Array<{ start: string; end: string }> }
  | { type: 'slots'; slots: Array<{ start: string; end: string }> }
  | { type: 'appointment_created'; appointment: AiAppointmentSummary; manageToken?: string }
  | { type: 'appointment_updated'; appointment: AiAppointmentSummary }
  | { type: 'appointment_cancelled'; appointment: AiAppointmentSummary }
  | { type: 'blocked_slot_created'; blockedSlot: { id: string; label: string; startAt: string; endAt: string } }

export interface AiChatResponse {
  reply: string
  actions: AiAction[]
}

export function sendAiChat(messages: ConversationTurn[], timezone: string, manageToken?: string): Promise<AiChatResponse> {
  return apiPost('/ai/chat', { messages, timezone, manageToken })
}
