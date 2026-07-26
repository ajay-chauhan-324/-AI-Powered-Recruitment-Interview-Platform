import { apiGet } from '@/lib/apiClient'

/**
 * The PUBLIC-safe calendar read model (server/src/services/calendarView.service.ts) —
 * deliberately minimal, no candidateName/candidateEmail/title/interviewType. An
 * authenticated admin view with full interview detail and cancelled-interview history is
 * a separate endpoint (adminApi.ts's fetchAdminInterviews).
 */
export interface CalendarInterview {
  id: string
  startAt: string
  endAt: string
  status: 'pending' | 'confirmed'
}

export interface CalendarBlock {
  id: string
  label: string
  startAt: string
  endAt: string
}

export interface CalendarView {
  interviews: CalendarInterview[]
  blockedSlots: CalendarBlock[]
}

export function fetchCalendarView(from: Date, to: Date): Promise<CalendarView> {
  return apiGet<CalendarView>('/calendar', { from: from.toISOString(), to: to.toISOString() })
}
