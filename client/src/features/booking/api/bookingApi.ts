import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'

export type InterviewType =
  | 'hr_screening'
  | 'technical'
  | 'coding'
  | 'system_design'
  | 'behavioral'
  | 'managerial'
  | 'final'
  | 'panel'
  | 'custom'

export type InterviewLocationType = 'video' | 'phone' | 'onsite' | 'custom'

export interface PublicInterview {
  id: string
  startAt: string
  endAt: string
  status: 'pending' | 'confirmed' | 'cancelled'
}

export interface OwnerInterview extends PublicInterview {
  title: string
  description: string
  interviewType: InterviewType
  round: number
  locationType: InterviewLocationType
  meetingUrl: string
  address: string
  interviewerName: string
  candidateName: string
  candidateEmail: string
  candidatePhone: string
  candidateLinkedIn: string
  candidateGithub: string
  candidatePortfolioUrl: string
  candidateResumeUrl: string
  candidateNotes: string
  durationMinutes: number
  timezone: string
}

export interface CreateInterviewInput {
  title?: string
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
  candidateLinkedIn?: string
  candidateGithub?: string
  candidatePortfolioUrl?: string
  candidateResumeUrl?: string
  candidateNotes?: string
  startAt: string
  durationMinutes: number
  timezone: string
}

export interface AvailableSlot {
  start: string
  end: string
}

export function createInterview(
  input: CreateInterviewInput,
): Promise<{ interview: PublicInterview; manageToken: string }> {
  return apiPost('/interviews', input)
}

export function fetchInterviewByToken(token: string): Promise<{ interview: OwnerInterview }> {
  return apiGet(`/interviews/manage/${token}`)
}

export function rescheduleInterviewByToken(
  token: string,
  newStart: string,
): Promise<{ interview: OwnerInterview }> {
  return apiPatch(`/interviews/manage/${token}`, { newStart })
}

export function cancelInterviewByToken(token: string): Promise<{ interview: OwnerInterview }> {
  return apiDelete(`/interviews/manage/${token}`)
}

export function fetchAvailability(from: Date, to: Date, durationMinutes: number): Promise<{ slots: AvailableSlot[] }> {
  return apiGet('/availability', {
    from: from.toISOString(),
    to: to.toISOString(),
    durationMinutes: String(durationMinutes),
  })
}
