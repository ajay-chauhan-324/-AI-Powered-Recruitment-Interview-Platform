import { apiGet } from '@/lib/apiClient'

/**
 * The PUBLIC-safe calendar read model (server/src/services/calendarView.service.ts).
 * No authentication exists yet (Phase 9 adds it), so this is deliberately minimal —
 * no name/email/purpose. An authenticated admin view with full appointment detail
 * and cancelled-appointment history is Phase 9 work.
 */
export interface CalendarAppointment {
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
  appointments: CalendarAppointment[]
  blockedSlots: CalendarBlock[]
}

export function fetchCalendarView(from: Date, to: Date): Promise<CalendarView> {
  return apiGet<CalendarView>('/calendar', { from: from.toISOString(), to: to.toISOString() })
}
