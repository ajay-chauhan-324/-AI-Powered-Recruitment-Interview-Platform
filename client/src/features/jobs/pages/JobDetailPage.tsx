import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Briefcase, Building2, DollarSign, FileQuestion, GraduationCap, ListChecks, MapPin, Users } from 'lucide-react'
import { PublicJobsShell } from '@/components/layout/PublicJobsShell'
import { fetchJobDetail } from '@/features/jobs/api/jobsApi'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { fetchMyApplications } from '@/features/applications/api/applicationsApi'
import { ApplyPanel } from '@/features/jobs/components/ApplyPanel'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SkillChip } from '@/components/ui/SkillChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { computeSkillOverlap } from '@/lib/skillOverlap'

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

const APPLICATION_STATUS_LABEL: Record<string, string> = {
  applied: 'Applied',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  interview_in_progress: 'Interviewing',
  selected: 'Selected',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
}

function formatSalary(min: number | null, max: number | null, currency: string): string | null {
  if (!min && !max) return null
  if (min && max) return `${currency} ${min.toLocaleString()}–${max.toLocaleString()}`
  return `${currency} ${(min ?? max)!.toLocaleString()}+`
}

export function JobDetailPage() {
  const { idOrSlug = '' } = useParams<{ idOrSlug: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useUserSession()
  const [showApply, setShowApply] = useState(false)

  const isRecruiter = session.data?.user.accountType === 'recruiter'

  const jobQuery = useQuery({ queryKey: ['job-detail', idOrSlug], queryFn: () => fetchJobDetail(idOrSlug) })
  const myApplicationsQuery = useQuery({
    queryKey: ['my-applications'],
    queryFn: fetchMyApplications,
    // Applications are a candidate-only concept — the backend now rejects this call for a
    // recruiter account (requireCandidateAuth), so it must never fire for one.
    enabled: session.data?.user.accountType === 'candidate',
  })

  const job = jobQuery.data?.job
  const company = jobQuery.data?.company
  const existingApplication = myApplicationsQuery.data?.applications.find((application) => application.job.id === job?.id)
  const candidateSkills = session.data?.user.skills ?? []
  const overlap = job && candidateSkills.length > 0 ? computeSkillOverlap(candidateSkills, job.requiredSkills) : null

  function handleApplyClick() {
    if (!session.data) {
      navigate('/register', { state: { from: `/jobs/${idOrSlug}` } })
      return
    }
    if (isRecruiter) return
    setShowApply(true)
  }

  if (jobQuery.isLoading) {
    return (
      <PublicJobsShell>
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </PublicJobsShell>
    )
  }

  if (jobQuery.isError) {
    return (
      <PublicJobsShell>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <EmptyState
            icon={Briefcase}
            title="Couldn't load this job."
            description="Something went wrong on our end — please try again."
            action={
              <Button variant="secondary" onClick={() => jobQuery.refetch()}>
                Try again
              </Button>
            }
          />
        </div>
      </PublicJobsShell>
    )
  }

  if (!job) {
    return (
      <PublicJobsShell>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <EmptyState
            icon={Briefcase}
            title="This job couldn't be found."
            description="It may have been closed or the link is incorrect."
            action={
              <Link to="/jobs">
                <Button variant="secondary">Browse other jobs</Button>
              </Link>
            }
          />
        </div>
      </PublicJobsShell>
    )
  }

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)

  return (
    <PublicJobsShell>
      <div className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 sm:pb-8">
        <Link to="/jobs" className="text-sm text-ink-700 underline hover:text-ink-900">
          ← All jobs
        </Link>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-3 flex items-start gap-4">
          <Avatar name={job.title} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-medium text-ink-900">{job.title}</h1>
            {company && (
              <Link to={`/companies/${company.id}`} className="mt-1 flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900 hover:underline">
                <Building2 size={14} aria-hidden="true" />
                {company.name}
              </Link>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{EMPLOYMENT_LABEL[job.employmentType]}</Badge>
              <Badge tone="neutral">{WORKPLACE_LABEL[job.workplaceType]}</Badge>
              <Badge tone="neutral" className="capitalize">
                {job.experienceLevel} level
              </Badge>
              {overlap && <Badge tone={overlap.pct >= 60 ? 'success' : 'warning'}>{overlap.pct}% skill match</Badge>}
            </div>
          </div>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            {job.description && (
              <section>
                <h2 className="text-md font-medium text-ink-900">About this role</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{job.description}</p>
              </section>
            )}

            {job.responsibilities.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
                  <ListChecks size={16} aria-hidden="true" className="text-amber-600" />
                  Responsibilities
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-700">
                  {job.responsibilities.map((item, index) => (
                    <li key={index}>· {item}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-md font-medium text-ink-900">Requirements</h2>
              <p className="mt-2 text-sm text-ink-700">
                Minimum {job.minExperienceYears} years of experience ({job.experienceLevel} level)
              </p>
              {job.requiredSkills.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Required skills</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {job.requiredSkills.map((skill) => (
                      <SkillChip key={skill} label={skill} tone={overlap?.matched.includes(skill) ? 'matched' : 'neutral'} />
                    ))}
                  </div>
                </div>
              )}
              {job.preferredSkills.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Preferred skills</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {job.preferredSkills.map((skill) => (
                      <SkillChip key={skill} label={skill} tone="neutral" />
                    ))}
                  </div>
                </div>
              )}
              {job.educationRequirement && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-700">
                  <GraduationCap size={14} aria-hidden="true" />
                  {job.educationRequirement}
                </p>
              )}
            </section>

            {job.screeningQuestions.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
                  <FileQuestion size={16} aria-hidden="true" className="text-amber-600" />
                  Screening questions
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-700">
                  {job.screeningQuestions.map((question, index) => (
                    <li key={index}>· {question}</li>
                  ))}
                </ul>
              </section>
            )}

            {company?.description && (
              <section>
                <h2 className="text-md font-medium text-ink-900">About {company.name}</h2>
                <p className="mt-2 text-sm text-ink-700">{company.description}</p>
              </section>
            )}
          </div>

          {/* Sidebar — sticky on desktop */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 flex flex-col gap-4 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
              {salary && (
                <div className="flex items-center gap-2 text-sm text-ink-900">
                  <DollarSign size={16} aria-hidden="true" className="text-amber-600" />
                  {salary}
                </div>
              )}
              {job.location && (
                <div className="flex items-center gap-2 text-sm text-ink-700">
                  <MapPin size={16} aria-hidden="true" className="text-ink-500" />
                  {job.location}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-ink-700">
                <Users size={16} aria-hidden="true" className="text-ink-500" />
                {job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'}
              </div>
              {isRecruiter ? (
                <p className="text-center text-xs text-ink-500">Signed in as a recruiter — recruiter accounts can't apply to jobs.</p>
              ) : existingApplication ? (
                <Badge tone="warning" className="justify-center py-2 text-sm">
                  {APPLICATION_STATUS_LABEL[existingApplication.status]}
                </Badge>
              ) : (
                <Button variant="primary" onClick={handleApplyClick}>
                  Apply now
                </Button>
              )}
            </div>
          </aside>
        </div>

        {/* Mobile sticky apply bar */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-paper-50 p-3 lg:hidden">
          {isRecruiter ? (
            <p className="text-center text-xs text-ink-500">Signed in as a recruiter — recruiter accounts can't apply to jobs.</p>
          ) : existingApplication ? (
            <Badge tone="warning" className="flex min-h-11 w-full items-center justify-center text-sm">
              {APPLICATION_STATUS_LABEL[existingApplication.status]}
            </Badge>
          ) : (
            <Button variant="primary" onClick={handleApplyClick} className="w-full">
              Apply now
            </Button>
          )}
        </div>
      </div>

      {showApply && (
        <ApplyPanel
          jobId={job.id}
          jobTitle={job.title}
          companyName={company?.name}
          onClose={() => setShowApply(false)}
          onApplied={() => {
            queryClient.invalidateQueries({ queryKey: ['my-applications'] })
          }}
        />
      )}
    </PublicJobsShell>
  )
}
