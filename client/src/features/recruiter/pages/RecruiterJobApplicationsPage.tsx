import { useMemo } from 'react'
import { ArrowLeft, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { fetchJobApplications, fetchRecruiterJob, type ApplicationStatus, type RecruiterApplication } from '@/features/recruiter/api/recruiterApi'
import { Avatar } from '@/components/ui/Avatar'
import { MatchScoreGauge } from '@/components/ui/MatchScoreGauge'
import { EmptyState } from '@/components/ui/EmptyState'

const EMPTY_APPLICATIONS: RecruiterApplication[] = []

const PIPELINE_COLUMNS: Array<{ status: ApplicationStatus; label: string }> = [
  { status: 'applied', label: 'Applied' },
  { status: 'under_review', label: 'Under Review' },
  { status: 'shortlisted', label: 'Shortlisted' },
  { status: 'interview_in_progress', label: 'Interviewing' },
  { status: 'selected', label: 'Selected' },
  { status: 'rejected', label: 'Rejected' },
]

function ApplicationCard({ application }: { application: RecruiterApplication }) {
  const name = application.candidate?.name ?? 'Unknown candidate'
  return (
    <Link
      to={`/recruiter/applications/${application.id}`}
      className="flex items-start gap-2 rounded-md border border-hairline bg-paper-50 p-3 shadow-tag hover:border-amber-600/40"
    >
      <Avatar name={name} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{name}</p>
        {application.candidate?.headline && <p className="truncate text-xs text-ink-700">{application.candidate.headline}</p>}
      </div>
      {application.atsAnalysis && <MatchScoreGauge score={application.atsAnalysis.score} size="sm" />}
    </Link>
  )
}

export function RecruiterJobApplicationsPage() {
  const { id } = useParams<{ id: string }>()
  const jobQuery = useQuery({ queryKey: ['recruiter-job', id], queryFn: () => fetchRecruiterJob(id!), enabled: Boolean(id) })
  const applicationsQuery = useQuery({
    queryKey: ['job-applications', id],
    queryFn: () => fetchJobApplications(id!),
    enabled: Boolean(id),
  })

  const applications = applicationsQuery.data?.applications ?? EMPTY_APPLICATIONS
  const grouped = useMemo(() => {
    const map = new Map<ApplicationStatus, RecruiterApplication[]>()
    for (const column of PIPELINE_COLUMNS) map.set(column.status, [])
    for (const application of applications) {
      const bucket = map.get(application.status)
      if (bucket) bucket.push(application)
      // 'withdrawn' has no column — withdrawn applications simply don't render here.
    }
    for (const bucket of map.values()) bucket.sort((a, b) => (b.atsAnalysis?.score ?? -1) - (a.atsAnalysis?.score ?? -1))
    return map
  }, [applications])

  return (
    <RecruiterLayout>
      <div className="px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Link to="/recruiter/jobs" className="inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900">
            <ArrowLeft size={14} aria-hidden="true" />
            All jobs
          </Link>
          <h1 className="mt-2 text-xl font-medium text-ink-900">{jobQuery.data?.job.title ?? 'Applications'}</h1>
          <p className="mt-1 text-sm text-ink-700">
            {applications.length} application{applications.length === 1 ? '' : 's'} · sorted by AI match within each stage
          </p>

          {applicationsQuery.isLoading && (
            <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
              {PIPELINE_COLUMNS.slice(0, 4).map((column) => (
                <div key={column.status} className="h-40 w-64 shrink-0 animate-pulse rounded-lg bg-paper-100" />
              ))}
            </div>
          )}

          {applicationsQuery.isError && (
            <p role="alert" className="mt-6 text-sm text-conflict">
              Couldn't load applications for this job. Please refresh the page to try again.
            </p>
          )}

          {!applicationsQuery.isLoading && !applicationsQuery.isError && applications.length === 0 && (
            <div className="mt-8">
              <EmptyState
                icon={Users}
                title="No applications yet."
                description="Applications will appear here once candidates apply."
              />
            </div>
          )}

          {applications.length > 0 && (
            <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
              {PIPELINE_COLUMNS.map((column) => (
                <div key={column.status} className="flex w-64 shrink-0 flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-700">
                    {column.label} ({grouped.get(column.status)?.length ?? 0})
                  </p>
                  <div className="flex flex-col gap-2">
                    {grouped.get(column.status)?.map((application) => (
                      <ApplicationCard key={application.id} application={application} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RecruiterLayout>
  )
}
