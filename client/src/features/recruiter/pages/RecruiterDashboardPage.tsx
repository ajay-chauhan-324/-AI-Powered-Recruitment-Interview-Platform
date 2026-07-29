import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Briefcase, FileText, Sparkles, UserCheck, Users } from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { useRecruiterApplications } from '@/features/recruiter/hooks/useRecruiterApplications'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MatchScoreGauge } from '@/components/ui/MatchScoreGauge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ApplicationStatus } from '@/features/recruiter/api/recruiterApi'

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

const WORKPLACE_LABEL: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  interview_in_progress: 'Interviewing',
  selected: 'Selected',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
}

const STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  applied: 'neutral',
  under_review: 'info',
  shortlisted: 'warning',
  interview_in_progress: 'warning',
  selected: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag">
      <Icon size={16} aria-hidden="true" className="text-amber-600" />
      <p className="mt-2 font-mono text-2xl tabular-nums text-ink-900">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink-700">{label}</p>
    </div>
  )
}

export function RecruiterDashboardPage() {
  const session = useUserSession()
  const { jobs, activeJobs, applications, isLoading, isError } = useRecruiterApplications()

  const insights = useMemo(() => {
    const strongNeedsReview = applications.filter(
      (application) =>
        (application.status === 'applied' || application.status === 'under_review') &&
        application.atsAnalysis &&
        application.atsAnalysis.score >= 75,
    ).length

    const exceptionalMatches = applications.filter((application) => (application.atsAnalysis?.score ?? 0) >= 90).length

    const applicantCounts = new Map<string, number>()
    for (const application of applications) applicantCounts.set(application.jobId, (applicantCounts.get(application.jobId) ?? 0) + 1)
    let topJob: { title: string; count: number } | null = null
    for (const job of activeJobs) {
      const count = applicantCounts.get(job.id) ?? 0
      if (count > 0 && (!topJob || count > topJob.count)) topJob = { title: job.title, count }
    }

    return { strongNeedsReview, exceptionalMatches, topJob }
  }, [applications, activeJobs])

  const shortlisted = applications.filter((application) => application.status === 'shortlisted').length
  const upcomingInterviews = applications.filter((application) =>
    application.rounds.some((round) => round.status === 'ready_to_book' || round.status === 'scheduled'),
  ).length

  const recentApplications = useMemo(
    () => [...applications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
    [applications],
  )

  const hasInsights = insights.strongNeedsReview > 0 || insights.exceptionalMatches > 0 || insights.topJob

  return (
    <RecruiterLayout>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">
          {session.data ? `Welcome, ${session.data.user.name.split(' ')[0]}` : 'Welcome'}
        </h1>
        <p className="mt-1 text-sm text-ink-700">A quick read on your hiring pipeline.</p>

        {isError && (
          <p role="alert" className="mt-8 text-sm text-conflict">
            Couldn't load your dashboard. Please refresh the page to try again.
          </p>
        )}

        {!isLoading && !isError && jobs.length === 0 && (
          <div className="mt-8">
            <EmptyState
              icon={Briefcase}
              title="Post your first job to start receiving applications."
              description="Once published, candidates can discover and apply — and the AI will analyze each application for you."
              action={
                <Link to="/recruiter/jobs/new">
                  <Button variant="primary">Post a job</Button>
                </Link>
              }
            />
          </div>
        )}

        {!isError && jobs.length > 0 && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={Briefcase} label="Active jobs" value={activeJobs.length} />
              <StatTile icon={FileText} label="Applications" value={applications.length} />
              <StatTile icon={UserCheck} label="Shortlisted" value={shortlisted} />
              <StatTile icon={Users} label="Interviews" value={upcomingInterviews} />
            </div>

            {hasInsights && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-6 rounded-lg border border-amber-600/30 bg-amber-100/40 p-5"
              >
                <h2 className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                  <Sparkles size={16} aria-hidden="true" className="text-amber-600" />
                  AI insights
                </h2>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-700">
                  {insights.strongNeedsReview > 0 && (
                    <li>
                      <Link to="/recruiter/candidates" className="text-ink-900 underline hover:no-underline">
                        {insights.strongNeedsReview} strong candidate{insights.strongNeedsReview === 1 ? '' : 's'}
                      </Link>{' '}
                      need{insights.strongNeedsReview === 1 ? 's' : ''} review.
                    </li>
                  )}
                  {insights.exceptionalMatches > 0 && (
                    <li>
                      <Link to="/recruiter/candidates" className="text-ink-900 underline hover:no-underline">
                        {insights.exceptionalMatches} candidate{insights.exceptionalMatches === 1 ? '' : 's'}
                      </Link>{' '}
                      {insights.exceptionalMatches === 1 ? 'has' : 'have'} a 90%+ job match.
                    </li>
                  )}
                  {insights.topJob && (
                    <li>
                      Your <span className="font-medium text-ink-900">{insights.topJob.title}</span> role has{' '}
                      {insights.topJob.count} applicant{insights.topJob.count === 1 ? '' : 's'}.
                    </li>
                  )}
                </ul>
              </motion.section>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/recruiter/jobs/new">
                <Button variant="primary">Post a job</Button>
              </Link>
              <Link to="/recruiter/jobs">
                <Button variant="secondary">Manage jobs</Button>
              </Link>
              <Link to="/recruiter/candidates">
                <Button variant="secondary">View candidates</Button>
              </Link>
            </div>

            <section className="mt-10">
              <h2 className="text-md font-medium text-ink-900">Recent applications</h2>
              {recentApplications.length === 0 ? (
                <p className="mt-2 text-sm text-ink-700">Applications will appear here once candidates apply.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {recentApplications.map((application) => (
                    <Link
                      key={application.id}
                      to={`/recruiter/applications/${application.id}`}
                      className="flex items-center gap-3 rounded-md border border-hairline bg-paper-50 px-3 py-2.5 hover:border-amber-600/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {application.candidate?.name ?? 'Unknown candidate'}
                          </p>
                          <Badge tone={STATUS_TONE[application.status]}>{STATUS_LABEL[application.status]}</Badge>
                        </div>
                        <p className="truncate text-xs text-ink-700">{application.jobTitle}</p>
                      </div>
                      {application.atsAnalysis && <MatchScoreGauge score={application.atsAnalysis.score} size="sm" />}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-md font-medium text-ink-900">Your jobs</h2>
              <div className="mt-3 flex flex-col gap-2">
                {jobs.slice(0, 6).map((job) => (
                  <Link
                    key={job.id}
                    to={`/recruiter/jobs/${job.id}/applications`}
                    className="flex items-center justify-between rounded-md border border-hairline bg-paper-50 px-3 py-2.5 hover:border-amber-600/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{job.title}</p>
                      <p className="truncate text-xs text-ink-700">
                        {EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType} ·{' '}
                        {WORKPLACE_LABEL[job.workplaceType] ?? job.workplaceType}
                      </p>
                    </div>
                    <Badge
                      tone={job.status === 'published' ? 'success' : job.status === 'draft' ? 'neutral' : 'warning'}
                      className="capitalize"
                    >
                      {job.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </RecruiterLayout>
  )
}
