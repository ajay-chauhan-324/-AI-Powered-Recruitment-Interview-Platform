import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/apiClient'
import type { InterviewLocationType, InterviewType } from '@/features/booking/api/bookingApi'

export interface AdminInterview {
  id: string
  title: string
  description: string
  interviewType: InterviewType
  round: number
  locationType: InterviewLocationType
  meetingUrl: string
  address: string
  interviewerName: string
  interviewerEmail: string
  candidateName: string
  candidateEmail: string
  candidatePhone: string
  candidateLinkedIn: string
  candidateGithub: string
  candidatePortfolioUrl: string
  candidateResumeUrl: string
  candidateNotes: string
  startAt: string
  endAt: string
  durationMinutes: number
  timezone: string
  status: 'pending' | 'confirmed' | 'cancelled'
  source: 'ai' | 'admin' | 'public'
  rescheduleHistory: Array<{ previousStartAt: string; previousEndAt: string; changedAt: string }>
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
  bufferMinutes: number
  minNoticeMinutes: number
  maxBookingWindowDays: number
}

export interface AdminBlockedSlot {
  id: string
  label: string
  startAt: string
  endAt: string
}

export interface DashboardInterviewSummary {
  id: string
  title: string
  interviewType: InterviewType
  round: number
  candidateName: string
  interviewerName: string
  startAt: string
  endAt: string
  status: 'pending' | 'confirmed' | 'cancelled'
}

export interface DashboardStats {
  todayCount: number
  upcomingCount: number
  totalScheduled: number
  cancelledCount: number
  rescheduledCount: number
  upcomingInterviews: DashboardInterviewSummary[]
  scheduleConfigured: boolean
}

export interface CandidateSummary {
  candidateEmail: string
  candidateName: string
  candidatePhone: string
  totalInterviews: number
  upcomingCount: number
  lastInterviewAt: string
}

export interface CandidateInterviewSummary {
  id: string
  title: string
  interviewType: InterviewType
  round: number
  status: 'pending' | 'confirmed' | 'cancelled'
  startAt: string
  endAt: string
  source: 'ai' | 'admin' | 'public'
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

// --- Interviews ---

export function fetchAdminInterviews(from: Date, to: Date): Promise<{ interviews: AdminInterview[] }> {
  return apiGet('/admin/interviews', { from: from.toISOString(), to: to.toISOString() })
}

export interface AdminCreateInterviewInput {
  title: string
  description?: string
  interviewType?: InterviewType
  round?: number
  locationType?: InterviewLocationType
  meetingUrl?: string
  address?: string
  interviewerName?: string
  interviewerEmail?: string
  candidateName: string
  candidateEmail: string
  candidatePhone?: string
  candidateNotes?: string
  startAt: string
  durationMinutes: number
  timezone: string
}

export function createAdminInterview(input: AdminCreateInterviewInput): Promise<{ interview: AdminInterview }> {
  return apiPost('/admin/interviews', input)
}

export function rescheduleAdminInterview(
  id: string,
  newStart: string,
  newDurationMinutes?: number,
): Promise<{ interview: AdminInterview }> {
  return apiPatch(`/admin/interviews/${id}`, { newStart, newDurationMinutes })
}

export function cancelAdminInterview(id: string): Promise<{ interview: AdminInterview }> {
  return apiDelete(`/admin/interviews/${id}`)
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

// --- Dashboard ---

export function fetchAdminDashboard(): Promise<DashboardStats> {
  return apiGet('/admin/dashboard')
}

// --- Candidates ---

export function fetchAdminCandidates(search?: string): Promise<{ candidates: CandidateSummary[] }> {
  return apiGet('/admin/candidates', search ? { search } : undefined)
}

export function fetchAdminCandidateInterviews(email: string): Promise<{ interviews: CandidateInterviewSummary[] }> {
  return apiGet(`/admin/candidates/${encodeURIComponent(email)}/interviews`)
}
