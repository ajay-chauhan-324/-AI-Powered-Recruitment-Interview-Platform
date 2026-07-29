import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/apiClient'
import type { EmploymentType, ExperienceLevel, WorkplaceType } from '@/features/jobs/api/jobsApi'
import type { AtsAnalysis, ApplicationStatus } from '@/features/applications/api/applicationsApi'
import type { InterviewLocationType, InterviewType, MeetingInfo, MeetingType } from '@/features/booking/api/bookingApi'
import type { EducationEntry, ExperienceEntry, ProjectEntry } from '@/features/auth/api/authApi'
import type { RecurringBreakEntry, ScheduleConfig, WorkingHoursEntry } from '@/features/admin/api/adminApi'

export type { EmploymentType, ExperienceLevel, WorkplaceType, AtsAnalysis, ApplicationStatus }
export type { RecurringBreakEntry, ScheduleConfig, WorkingHoursEntry }

// --- Company ---

export interface RecruiterCompany {
  id: string
  name: string
  logoUrl: string
  website: string
  description: string
  industry: string
  size: string
  location: string
  linkedIn: string
  foundedYear: number | null
  benefits: string[]
  culture: string
  techStack: string[]
}

export function fetchRecruiterCompany(): Promise<{ company: RecruiterCompany }> {
  return apiGet('/recruiter/company')
}

export interface UpdateCompanyInput {
  name?: string
  logoUrl?: string
  website?: string
  description?: string
  industry?: string
  size?: string
  location?: string
  linkedIn?: string
  foundedYear?: number
  benefits?: string[]
  culture?: string
  techStack?: string[]
}

export function updateRecruiterCompany(input: UpdateCompanyInput): Promise<{ company: RecruiterCompany }> {
  return apiPatch('/recruiter/company', input)
}

// --- Jobs ---

export type JobStatus = 'draft' | 'published' | 'paused' | 'closed'

/** Deliberately minimal (CLAUDE.md's round-builder spec): type, duration, and location only.
 * Interviewer/meeting-link/instructions detail is configured later, per candidate, when the
 * recruiter unlocks the round (RecruiterApplicationDetailPage's AdvanceRoundForm) — not
 * duplicated here. */
export interface PipelineStage {
  order: number
  type: InterviewType
  title: string
  durationMinutes: number
  instructions: string
  locationType: InterviewLocationType
}

export interface RecruiterJob {
  id: string
  companyId: string
  title: string
  slug: string
  description: string
  responsibilities: string[]
  employmentType: EmploymentType
  workplaceType: WorkplaceType
  location: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  experienceLevel: ExperienceLevel
  minExperienceYears: number
  requiredSkills: string[]
  preferredSkills: string[]
  educationRequirement: string
  screeningQuestions: string[]
  pipeline: PipelineStage[]
  atsThreshold: number
  status: JobStatus
  publishedAt: string | null
  closingDate: string | null
  createdAt: string
}

export interface JobInput {
  title: string
  description?: string
  responsibilities?: string[]
  employmentType?: EmploymentType
  workplaceType?: WorkplaceType
  location?: string
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  experienceLevel?: ExperienceLevel
  minExperienceYears?: number
  requiredSkills?: string[]
  preferredSkills?: string[]
  educationRequirement?: string
  screeningQuestions?: string[]
  pipeline?: PipelineStage[]
  atsThreshold?: number
  closingDate?: string
}

export function fetchRecruiterJobs(): Promise<{ jobs: RecruiterJob[] }> {
  return apiGet('/recruiter/jobs')
}

export function fetchRecruiterJob(id: string): Promise<{ job: RecruiterJob }> {
  return apiGet(`/recruiter/jobs/${id}`)
}

export function createRecruiterJob(input: JobInput): Promise<{ job: RecruiterJob }> {
  return apiPost('/recruiter/jobs', input)
}

export function updateRecruiterJob(id: string, input: Partial<JobInput>): Promise<{ job: RecruiterJob }> {
  return apiPatch(`/recruiter/jobs/${id}`, input)
}

export function publishRecruiterJob(id: string): Promise<{ job: RecruiterJob }> {
  return apiPost(`/recruiter/jobs/${id}/publish`)
}

export function pauseRecruiterJob(id: string): Promise<{ job: RecruiterJob }> {
  return apiPost(`/recruiter/jobs/${id}/pause`)
}

export function closeRecruiterJob(id: string): Promise<{ job: RecruiterJob }> {
  return apiPost(`/recruiter/jobs/${id}/close`)
}

export function duplicateRecruiterJob(id: string): Promise<{ job: RecruiterJob }> {
  return apiPost(`/recruiter/jobs/${id}/duplicate`)
}

// --- Applications ---

export interface RecruiterCandidateSummary {
  id: string
  name: string
  email: string
  headline: string
  about: string
  location: string
  skills: string[]
  experienceLevel: ExperienceLevel | null
  linkedIn: string
  github: string
  portfolioUrl: string
  photoUrl: string
  education: EducationEntry[]
  experience: ExperienceEntry[]
  projects: ProjectEntry[]
}

/** Mirrors Application.model.ts's APPLICATION_ROUND_STATUSES. */
export type ApplicationRoundStatus = 'locked' | 'ready_to_book' | 'scheduled' | 'passed' | 'failed'

/** One round of an application's pipeline, as seen by the owning recruiter — see
 * recruiterApplications.controller.ts's toJson for the exact shape this mirrors (a superset
 * of the candidate's own view: also includes interviewerEmail). */
export interface RecruiterApplicationRound {
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
  interviewerEmail: string
  interviewId: string | null
}

export interface RecruiterApplication {
  id: string
  jobId: string
  candidate: RecruiterCandidateSummary | null
  resumeId: string
  status: ApplicationStatus
  atsAnalysis: AtsAnalysis | null
  recruiterNotes: string
  rounds: RecruiterApplicationRound[]
  createdAt: string
}

export function fetchJobApplications(jobId: string): Promise<{ applications: RecruiterApplication[] }> {
  return apiGet(`/recruiter/jobs/${jobId}/applications`)
}

export interface RecruiterApplicationWithJob extends RecruiterApplication {
  jobTitle: string
}

/** Every application across every one of the recruiter's jobs, in a single request — reuses
 * the same listApplicationsForRecruiter service the recruiter AI already calls, rather than
 * the dashboard/candidates/AI-insight pages fanning out one fetchJobApplications call per
 * job (see useRecruiterApplications.ts, which used to do exactly that). */
export function fetchAllRecruiterApplications(): Promise<{ applications: RecruiterApplicationWithJob[] }> {
  return apiGet('/recruiter/applications')
}

export function fetchRecruiterApplication(id: string): Promise<{ application: RecruiterApplication }> {
  return apiGet(`/recruiter/applications/${id}`)
}

export function updateApplicationStatus(id: string, status: ApplicationStatus): Promise<{ application: RecruiterApplication }> {
  return apiPatch(`/recruiter/applications/${id}/status`, { status })
}

export function updateApplicationNotes(id: string, notes: string): Promise<{ application: RecruiterApplication }> {
  return apiPatch(`/recruiter/applications/${id}/notes`, { notes })
}

export function recordRoundOutcome(
  id: string,
  order: number,
  outcome: 'passed' | 'failed',
): Promise<{ application: RecruiterApplication }> {
  return apiPost(`/recruiter/applications/${id}/rounds/${order}/outcome`, { outcome })
}

/** Recruiter-scoped resume download (ownership flows through the job, not the resume
 * record itself — see recruiterApplications.controller.ts's getApplicationResumeFile). This
 * is deliberately a different URL from the candidate's own `/resumes/:id/file` route. */
export function applicationResumeDownloadUrl(applicationId: string): string {
  return `/api/v1/recruiter/applications/${applicationId}/resume`
}

/** Same ownership boundary as the resume download above (flows through the application, not
 * the candidate id) — safe to use directly as an <img src>. */
export function applicationCandidatePhotoUrl(applicationId: string): string {
  return `/api/v1/recruiter/applications/${applicationId}/photo`
}

// --- Interviews (recruiter's own calendar) ---

export interface RecruiterInterview {
  id: string
  job: { id: string; title: string; companyName: string }
  applicationId: string | null
  title: string
  interviewType: InterviewType
  round: number
  locationType: InterviewLocationType
  meetingType: MeetingType
  meetingUrl: string
  meeting: MeetingInfo | null
  address: string
  candidateName: string
  candidateEmail: string
  startAt: string
  endAt: string
  durationMinutes: number
  timezone: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
}

/** Every interview booked against one of this recruiter's jobs, across every application —
 * powers the recruiter Calendar page (distinct from the candidate's own read-only calendar). */
export function fetchRecruiterInterviews(): Promise<{ interviews: RecruiterInterview[] }> {
  return apiGet('/recruiter/interviews')
}

/** Reschedules one interview on the recruiter's own calendar — ownership is re-verified
 * server-side through the interview's job, never trusted from the id alone. Reuses the same
 * conflict-safe InterviewService every other reschedule path uses. */
export function rescheduleRecruiterInterview(id: string, newStart: string): Promise<{ interview: RecruiterInterview }> {
  return apiPatch(`/recruiter/interviews/${id}`, { newStart })
}

export function cancelRecruiterInterview(id: string): Promise<{ interview: RecruiterInterview }> {
  return apiDelete(`/recruiter/interviews/${id}`)
}

// --- Interview calendar (the recruiter's own working hours) ---

/** The signed-in recruiter's own calendar (CLAUDE.md §36 second pivot: "the recruiter
 * calendar becomes the source of truth") — every candidate booking a round against one of
 * this recruiter's jobs checks against exactly this configuration, auto-seeded with a
 * starting pattern the first time it's read, freely editable thereafter (unlike the legacy
 * admin schedule, this has no fixed-pattern restriction). */
export function fetchRecruiterSchedule(): Promise<{ schedule: ScheduleConfig }> {
  return apiGet('/recruiter/schedule')
}

export function saveRecruiterSchedule(schedule: ScheduleConfig): Promise<{ schedule: ScheduleConfig }> {
  return apiPut('/recruiter/schedule', schedule)
}
