import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Briefcase, Calendar, CheckCircle2, FileText, MapPin, Sparkles, Target, Video } from 'lucide-react'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'
import { fetchMyApplications } from '@/features/applications/api/applicationsApi'
import { fetchMyInterviews } from '@/features/interviews/api/myInterviewsApi'
import { fetchResumes } from '@/features/settings/api/resumesApi'
import { fetchJobs, type PublicJobSummary } from '@/features/jobs/api/jobsApi'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SkillChip } from '@/components/ui/SkillChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { formatClockInTimeZone } from '@/features/calendar/lib/layout'
import { computeSkillOverlap } from '@/lib/skillOverlap'
import type { OwnerInterview } from '@/features/booking/api/bookingApi'
import type { CandidateApplication } from '@/features/applications/api/applicationsApi'

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

const EMPTY_APPLICATIONS: CandidateApplication[] = []
const EMPTY_INTERVIEWS: OwnerInterview[] = []

function StatTile({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag">
      <div className="flex items-center gap-2 text-ink-500">
        <Icon size={14} aria-hidden="true" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 font-mono text-2xl tabular-nums text-ink-900">{value}</p>
    </div>
  )
}

function formatRelativeDay(target: Date, now: Date): string {
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((startOfTarget.getTime() - startOfNow.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return target.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function RecommendedJobCard({ job, candidateSkills }: { job: PublicJobSummary; candidateSkills: string[] }) {
  const overlap = computeSkillOverlap(candidateSkills, job.requiredSkills)
  return (
    <div className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{job.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-700">
            <MapPin size={12} aria-hidden="true" />
            {job.location || 'Location not specified'} · {EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}
          </p>
        </div>
        {candidateSkills.length > 0 && job.requiredSkills.length > 0 && (
          <Badge tone={overlap.pct >= 60 ? 'success' : 'neutral'}>{overlap.pct}% skill match</Badge>
        )}
      </div>
      {job.requiredSkills.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {overlap.matched.map((skill) => (
            <SkillChip key={skill} label={skill} tone="matched" />
          ))}
          {overlap.missing.slice(0, 3).map((skill) => (
            <SkillChip key={skill} label={skill} tone="neutral" />
          ))}
        </div>
      )}
      <div className="mt-3">
        <Link to={`/jobs/${job.slug}`}>
          <Button variant="secondary" size="sm">
            View job
          </Button>
        </Link>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const session = useUserSession()
  const user = session.data?.user

  const applicationsQuery = useQuery({ queryKey: ['my-applications'], queryFn: fetchMyApplications })
  const interviewsQuery = useQuery({ queryKey: ['my-interviews'], queryFn: fetchMyInterviews })
  const resumesQuery = useQuery({ queryKey: ['resumes'], queryFn: fetchResumes })
  const jobsQuery = useQuery({ queryKey: ['jobs', 'recommended'], queryFn: () => fetchJobs({ limit: 4 }) })

  const applications: CandidateApplication[] = applicationsQuery.data?.applications ?? EMPTY_APPLICATIONS
  const interviews: OwnerInterview[] = interviewsQuery.data?.interviews ?? EMPTY_INTERVIEWS
  const resumes = resumesQuery.data?.resumes ?? []
  const jobs = jobsQuery.data?.jobs ?? []

  const now = new Date()

  const stats = useMemo(() => {
    const active = applications.filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn')
    const shortlistedOrFurther = applications.filter(
      (a) => a.status === 'shortlisted' || a.status === 'interview_in_progress' || a.status === 'selected',
    )
    const interviewStage = applications.filter((a) => a.rounds.some((round) => round.status === 'ready_to_book' || round.status === 'scheduled'))
    return { total: applications.length, active: active.length, shortlisted: shortlistedOrFurther.length, interviews: interviewStage.length }
  }, [applications])

  const nextInterview = useMemo(() => {
    const nowMs = Date.now()
    return interviews
      .filter((interview) => interview.status !== 'cancelled' && new Date(interview.endAt).getTime() > nowMs)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0]
  }, [interviews])

  const profileChecklist = [
    { label: 'Headline added', done: Boolean(user?.headline) },
    { label: 'Location added', done: Boolean(user?.location) },
    { label: 'Skills added', done: (user?.skills.length ?? 0) > 0 },
    { label: 'Experience level set', done: Boolean(user?.experienceLevel) },
    { label: 'Resume uploaded', done: resumes.length > 0 },
  ]
  const completedCount = profileChecklist.filter((item) => item.done).length
  const completionPct = Math.round((completedCount / profileChecklist.length) * 100)

  const isLoading = applicationsQuery.isLoading || interviewsQuery.isLoading
  const isError = applicationsQuery.isError || interviewsQuery.isError || resumesQuery.isError || jobsQuery.isError
  const hasAnyActivity = applications.length > 0 || interviews.length > 0

  return (
    <AuthenticatedLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">
          {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Welcome back'}
        </h1>
        <p className="mt-1 text-sm text-ink-700">Here's where your job search stands today.</p>

        {isError && (
          <p role="alert" className="mt-4 text-sm text-conflict">
            Some of your dashboard data couldn't load. Please refresh to try again.
          </p>
        )}

        {isLoading && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {!isLoading && !hasAnyActivity && (
          <div className="mt-8">
            <EmptyState
              icon={Briefcase}
              title="Your interview schedule starts here."
              description="Browse open roles and apply with your resume to get started."
              action={
                <Link to="/jobs">
                  <Button variant="primary">Browse jobs</Button>
                </Link>
              }
            />
          </div>
        )}

        {!isLoading && hasAnyActivity && (
          <>
            <section className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Your application activity</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile icon={FileText} label="Applications" value={stats.total} />
                <StatTile icon={Target} label="Shortlisted+" value={stats.shortlisted} />
                <StatTile icon={Video} label="Interviews" value={stats.interviews} />
                <StatTile icon={CheckCircle2} label="Active" value={stats.active} />
              </div>
            </section>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                {nextInterview && (
                  <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-lg border border-amber-600/40 bg-amber-100 p-5 shadow-tag"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Next interview</p>
                    <p className="mt-1.5 text-md font-medium text-ink-900">{nextInterview.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-sm tabular-nums text-ink-700">
                      <Calendar size={14} aria-hidden="true" />
                      {formatRelativeDay(new Date(nextInterview.startAt), now)} ·{' '}
                      {formatClockInTimeZone(new Date(nextInterview.startAt), nextInterview.timezone)} ({nextInterview.timezone})
                    </p>
                    <div className="mt-3">
                      <Link to="/interviews">
                        <Button variant="primary" size="sm">
                          View interview
                        </Button>
                      </Link>
                    </div>
                  </motion.section>
                )}

                <section>
                  <div className="flex items-center justify-between">
                    <h2 className="text-md font-medium text-ink-900">Recommended for you</h2>
                    <Link to="/jobs" className="text-sm text-ink-700 underline hover:text-ink-900">
                      Browse all
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    {jobs.length === 0 && !jobsQuery.isLoading && (
                      <p className="text-sm text-ink-700">No open roles right now — check back soon.</p>
                    )}
                    {jobs.slice(0, 3).map((job) => (
                      <RecommendedJobCard key={job.id} job={job} candidateSkills={user?.skills ?? []} />
                    ))}
                  </div>
                </section>
              </div>

              <div className="flex flex-col gap-6">
                <section className="rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-900">Profile completion</p>
                    <span className="font-mono text-sm tabular-nums text-ink-700">{completionPct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-paper-200">
                    <div
                      className="h-full rounded-pill bg-amber-600 transition-all duration-500"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                    {profileChecklist.map((item) => (
                      <li key={item.label} className="flex items-center gap-2">
                        <CheckCircle2
                          size={14}
                          aria-hidden="true"
                          className={item.done ? 'text-available' : 'text-ink-300'}
                        />
                        <span className={item.done ? 'text-ink-700' : 'text-ink-500'}>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                  {completionPct < 100 && (
                    <Link to="/settings" className="mt-3 inline-block">
                      <Button variant="secondary" size="sm">
                        Complete profile
                      </Button>
                    </Link>
                  )}
                </section>

                {!resumesQuery.isLoading && resumes.length === 0 && (
                  <section className="rounded-lg border border-conflict/30 bg-conflict-tint p-5">
                    <div className="flex items-center gap-2 text-conflict">
                      <FileText size={16} aria-hidden="true" />
                      <p className="text-sm font-medium">No resume on file</p>
                    </div>
                    <p className="mt-1.5 text-sm text-ink-700">Upload a resume so recruiters and AI analysis can see your fit.</p>
                    <Link to="/settings" className="mt-3 inline-block">
                      <Button variant="secondary" size="sm">
                        Upload resume
                      </Button>
                    </Link>
                  </section>
                )}

                <section className="rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
                  <div className="flex items-center gap-2 text-amber-600">
                    <Sparkles size={16} aria-hidden="true" />
                    <p className="text-sm font-medium text-ink-900">Ask the AI assistant</p>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-700">Get help finding jobs, understanding your AI match, or managing interviews.</p>
                  <Link to="/ai" className="mt-3 inline-block">
                    <Button variant="secondary" size="sm">
                      Open assistant
                    </Button>
                  </Link>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </AuthenticatedLayout>
  )
}
