import { useQuery } from '@tanstack/react-query'
import { fetchAllRecruiterApplications, fetchRecruiterJobs, type RecruiterApplicationWithJob, type RecruiterJob } from '@/features/recruiter/api/recruiterApi'

const EMPTY_JOBS: RecruiterJob[] = []
const EMPTY_APPLICATIONS: RecruiterApplicationWithJob[] = []

export type { RecruiterApplicationWithJob }

/** Aggregates applications across every one of the recruiter's active jobs via a single
 * batched request (server/src/controllers/recruiter/recruiterApplications.controller.ts's
 * getAllRecruiterApplications) instead of fanning out one request per job. Shared by the
 * dashboard, candidates list, and AI insight computations so they never drift out of sync. */
export function useRecruiterApplications() {
  const jobsQuery = useQuery({ queryKey: ['recruiter-jobs'], queryFn: fetchRecruiterJobs })
  const jobs = jobsQuery.data?.jobs ?? EMPTY_JOBS
  const activeJobs = jobs.filter((job) => job.status === 'published' || job.status === 'paused')
  const activeJobIds = new Set(activeJobs.map((job) => job.id))

  const applicationsQuery = useQuery({ queryKey: ['recruiter-applications'], queryFn: fetchAllRecruiterApplications })
  const allApplications = applicationsQuery.data?.applications ?? EMPTY_APPLICATIONS
  // Only applications to a currently active (published/paused) job — a closed/draft job's
  // applications are excluded here, matching the previous per-job fan-out's own scoping
  // (it only ever queried activeJobs in the first place).
  const applications = allApplications.filter((application) => activeJobIds.has(application.jobId))

  const isLoading = jobsQuery.isLoading || applicationsQuery.isLoading
  const isError = jobsQuery.isError || applicationsQuery.isError

  return { jobs, activeJobs, applications, isLoading, isError }
}
