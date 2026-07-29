import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Briefcase, MapPin, Search, SlidersHorizontal, Users } from 'lucide-react'
import { PublicJobsShell } from '@/components/layout/PublicJobsShell'
import { fetchJobs, type EmploymentType, type ExperienceLevel, type PublicJobSummary, type WorkplaceType } from '@/features/jobs/api/jobsApi'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { computeSkillOverlap } from '@/lib/skillOverlap'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

const WORKPLACE_LABEL: Record<WorkplaceType, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
}

function formatSalary(min: number | null, max: number | null, currency: string): string | null {
  if (!min && !max) return null
  if (min && max) return `${currency} ${(min / 1000).toFixed(0)}k–${(max / 1000).toFixed(0)}k`
  return `${currency} ${((min ?? max)! / 1000).toFixed(0)}k+`
}

function formatPostedAgo(publishedAt: string): string {
  const days = Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86_400_000)
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  if (days < 30) return `Posted ${days}d ago`
  return `Posted ${Math.floor(days / 30)}mo ago`
}

function JobCard({ job, candidateSkills, index }: { job: PublicJobSummary; candidateSkills: string[]; index: number }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)
  const overlap = candidateSkills.length > 0 ? computeSkillOverlap(candidateSkills, job.requiredSkills) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
    >
      <Link
        to={`/jobs/${job.slug}`}
        className="flex gap-3 rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag transition-colors hover:border-amber-600/40"
      >
        <Avatar name={job.title} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-sm font-medium text-ink-900">{job.title}</p>
            {overlap && (
              <Badge tone={overlap.pct >= 60 ? 'success' : 'neutral'} className="shrink-0">
                {overlap.pct}% skill match
              </Badge>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-700">
            <span className="capitalize">{job.experienceLevel}</span>
            <span aria-hidden="true">·</span>
            <span>{EMPLOYMENT_LABEL[job.employmentType]}</span>
            <span aria-hidden="true">·</span>
            <span>{WORKPLACE_LABEL[job.workplaceType]}</span>
            {job.location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <MapPin size={11} aria-hidden="true" />
                  {job.location}
                </span>
              </>
            )}
            {salary && (
              <>
                <span aria-hidden="true">·</span>
                <span>{salary}</span>
              </>
            )}
          </p>
          {job.requiredSkills.length > 0 && (
            <p className="mt-2 text-xs text-ink-500">{job.requiredSkills.slice(0, 6).join(' · ')}</p>
          )}
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-500">
            <span>{formatPostedAgo(job.publishedAt)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Users size={11} aria-hidden="true" />
              {job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function JobsListPage() {
  const session = useUserSession()
  const [search, setSearch] = useState('')
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('')
  const [workplaceType, setWorkplaceType] = useState<WorkplaceType | ''>('')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | ''>('')

  const jobsQuery = useQuery({
    queryKey: ['jobs', search, employmentType, workplaceType, experienceLevel],
    queryFn: () =>
      fetchJobs({
        search: search || undefined,
        employmentType: employmentType || undefined,
        workplaceType: workplaceType || undefined,
        experienceLevel: experienceLevel || undefined,
        limit: 30,
      }),
  })

  const jobs = jobsQuery.data?.jobs ?? []
  const candidateSkills = session.data?.user.skills ?? []

  return (
    <PublicJobsShell>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">Jobs</h1>
        <p className="mt-1 text-sm text-ink-700">Find your next interview.</p>

        <div className="mt-6 flex flex-col gap-3">
          <label className="relative flex items-center">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-500" />
            <span className="sr-only">Search jobs</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title or skill…"
              className="w-full rounded-md border border-hairline bg-paper-50 py-2 pl-9 pr-3 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={14} aria-hidden="true" className="text-ink-500" />
            <select
              value={employmentType}
              onChange={(event) => setEmploymentType(event.target.value as EmploymentType | '')}
              className="min-h-9 rounded-md border border-hairline bg-paper-50 px-2.5 text-sm text-ink-900 focus-visible:outline-none"
            >
              <option value="">Any employment type</option>
              {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((value) => (
                <option key={value} value={value}>
                  {EMPLOYMENT_LABEL[value]}
                </option>
              ))}
            </select>
            <select
              value={workplaceType}
              onChange={(event) => setWorkplaceType(event.target.value as WorkplaceType | '')}
              className="min-h-9 rounded-md border border-hairline bg-paper-50 px-2.5 text-sm text-ink-900 focus-visible:outline-none"
            >
              <option value="">Any workplace type</option>
              {(Object.keys(WORKPLACE_LABEL) as WorkplaceType[]).map((value) => (
                <option key={value} value={value}>
                  {WORKPLACE_LABEL[value]}
                </option>
              ))}
            </select>
            <select
              value={experienceLevel}
              onChange={(event) => setExperienceLevel(event.target.value as ExperienceLevel | '')}
              className="min-h-9 rounded-md border border-hairline bg-paper-50 px-2.5 text-sm text-ink-900 focus-visible:outline-none"
            >
              <option value="">Any experience level</option>
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="executive">Executive</option>
            </select>
          </div>
        </div>

        {jobsQuery.isLoading && (
          <div className="mt-6 flex flex-col gap-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {jobsQuery.isError && (
          <p role="alert" className="mt-8 text-sm text-conflict">
            Couldn't load jobs. Please try again.
          </p>
        )}

        {!jobsQuery.isLoading && !jobsQuery.isError && jobs.length === 0 && (
          <div className="mt-8">
            <EmptyState icon={Briefcase} title="No jobs match your search." description="Try a broader search or check back soon." />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {jobs.map((job, index) => (
            <JobCard key={job.id} job={job} candidateSkills={candidateSkills} index={index} />
          ))}
        </div>
      </div>
    </PublicJobsShell>
  )
}
