import { apiGet, apiPost } from '@/lib/apiClient'
import type { InterviewLocationType, InterviewType } from '@/features/booking/api/bookingApi'

/** Mirrors server/src/models/Application.model.ts's APPLICATION_STATUSES exactly —
 * `interview_in_progress` and `selected` are round-driven only, never set by hand. */
export type ApplicationStatus =
  | 'applied'
  | 'under_review'
  | 'shortlisted'
  | 'interview_in_progress'
  | 'selected'
  | 'rejected'
  | 'withdrawn'

/** Mirrors Application.model.ts's APPLICATION_ROUND_STATUSES. */
export type ApplicationRoundStatus = 'locked' | 'ready_to_book' | 'scheduled' | 'passed' | 'failed'

export interface AtsAnalysis {
  score: number
  confidence: 'low' | 'medium' | 'high'
  matchedSkills: string[]
  missingSkills: string[]
  experienceMatch: string
  educationMatch: string
  strengths: string[]
  gaps: string[]
  recommendations: string[]
  evidence: string[]
  analyzedAt: string
}

export interface ApplicationJobSummary {
  id: string
  title: string
  companyId: string
  companyName: string
  location: string
  employmentType: string
  workplaceType: string
}

/** One round of the candidate's own copy of the job's interview pipeline — see
 * applications.controller.ts's toCandidateJson for the exact shape this mirrors. A candidate
 * may only ever book the single round with status 'ready_to_book' (enforced server-side in
 * application.service.ts, never trusted from here). */
export interface ApplicationRound {
  order: number
  type: InterviewType
  title: string
  durationMinutes: number
  instructions: string
  status: ApplicationRoundStatus
  locationType: InterviewLocationType | null
  meetingUrl: string
  address: string
  interviewerName: string
  interviewId: string | null
}

/** ATS analysis is deliberately absent here — it's a recruiter-only tool
 * (applications.controller.ts's toCandidateJson never includes it in the candidate's own
 * view of their application, even though it's computed and stored at apply-time). */
export interface CandidateApplication {
  id: string
  job: ApplicationJobSummary
  resumeId: string
  status: ApplicationStatus
  rounds: ApplicationRound[]
  createdAt: string
}

export function createApplication(jobId: string, resumeId: string): Promise<{ application: CandidateApplication }> {
  return apiPost('/applications', { jobId, resumeId })
}

export function fetchMyApplications(): Promise<{ applications: CandidateApplication[] }> {
  return apiGet('/applications')
}

export function fetchMyApplication(id: string): Promise<{ application: CandidateApplication }> {
  return apiGet(`/applications/${id}`)
}

export function scheduleApplicationInterview(
  id: string,
  startAt: string,
  timezone: string,
): Promise<{ application: CandidateApplication; manageToken: string }> {
  return apiPost(`/applications/${id}/schedule`, { startAt, timezone })
}

export interface ApplicationRoundAvailabilitySlot {
  start: string
  end: string
}

/** Real, live slots on the owning recruiter's own calendar for the round currently ready to
 * book (CLAUDE.md §36 second pivot: "the recruiter calendar becomes the source of truth") —
 * replaces the generic /availability endpoint, which had no notion of which recruiter's
 * calendar to check. Returns the recruiter's effective timezone so the caller never has to
 * assume one. */
export function fetchApplicationRoundAvailability(
  id: string,
  from: Date,
  to: Date,
): Promise<{ slots: ApplicationRoundAvailabilitySlot[]; timezone: string; durationMinutes: number }> {
  return apiGet(`/applications/${id}/availability`, { from: from.toISOString(), to: to.toISOString() })
}
