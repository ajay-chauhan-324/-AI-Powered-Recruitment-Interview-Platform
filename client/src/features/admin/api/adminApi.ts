import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/apiClient'

export interface AdminAppointment {
  id: string
  name: string
  email: string
  purpose: string
  startAt: string
  endAt: string
  durationMinutes: number
  timezone: string
  status: 'pending' | 'confirmed' | 'cancelled'
  source: 'ai' | 'admin' | 'public'
}

export interface WorkingHoursEntry {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  isActive: boolean
}

export interface RecurringBreakEntry {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  label: string
}

export interface ScheduleConfig {
  timezone: string
  workingHours: WorkingHoursEntry[]
  breaks: RecurringBreakEntry[]
}

export interface AdminBlockedSlot {
  id: string
  label: string
  startAt: string
  endAt: string
}

// --- Auth ---

export function adminLogin(email: string, password: string): Promise<{ admin: { email: string } }> {
  return apiPost('/admin/auth/login', { email, password })
}

export function adminLogout(): Promise<{ ok: boolean }> {
  return apiPost('/admin/auth/logout')
}

export function adminMe(): Promise<{ admin: { adminId: string; email: string } }> {
  return apiGet('/admin/auth/me')
}

// --- Appointments ---

export function fetchAdminAppointments(from: Date, to: Date): Promise<{ appointments: AdminAppointment[] }> {
  return apiGet('/admin/appointments', { from: from.toISOString(), to: to.toISOString() })
}

export interface AdminCreateAppointmentInput {
  name: string
  email: string
  purpose: string
  startAt: string
  durationMinutes: number
  timezone: string
}

export function createAdminAppointment(
  input: AdminCreateAppointmentInput,
): Promise<{ appointment: AdminAppointment }> {
  return apiPost('/admin/appointments', input)
}

export function rescheduleAdminAppointment(
  id: string,
  newStart: string,
  newDurationMinutes?: number,
): Promise<{ appointment: AdminAppointment }> {
  return apiPatch(`/admin/appointments/${id}`, { newStart, newDurationMinutes })
}

export function cancelAdminAppointment(id: string): Promise<{ appointment: AdminAppointment }> {
  return apiDelete(`/admin/appointments/${id}`)
}

// --- Schedule ---

export function fetchAdminSchedule(): Promise<{ schedule: ScheduleConfig | null }> {
  return apiGet('/admin/schedule')
}

export function saveAdminSchedule(schedule: ScheduleConfig): Promise<{ schedule: ScheduleConfig }> {
  return apiPut('/admin/schedule', schedule)
}

// --- Blocked slots ---

export function fetchAdminBlockedSlots(from: Date, to: Date): Promise<{ blockedSlots: AdminBlockedSlot[] }> {
  return apiGet('/admin/blocked-slots', { from: from.toISOString(), to: to.toISOString() })
}

export function createAdminBlockedSlot(
  label: string,
  startAt: string,
  endAt: string,
): Promise<{ blockedSlot: AdminBlockedSlot }> {
  return apiPost('/admin/blocked-slots', { label, startAt, endAt })
}

export function deleteAdminBlockedSlot(id: string): Promise<{ ok: boolean }> {
  return apiDelete(`/admin/blocked-slots/${id}`)
}
