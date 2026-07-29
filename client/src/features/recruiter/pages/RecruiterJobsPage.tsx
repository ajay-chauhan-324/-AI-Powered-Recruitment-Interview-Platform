import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Briefcase, MapPin, Users } from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import {
  closeRecruiterJob,
  duplicateRecruiterJob,
  fetchRecruiterJobs,
  pauseRecruiterJob,
  publishRecruiterJob,
  type RecruiterJob,
} from '@/features/recruiter/api/recruiterApi'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ApiError } from '@/lib/apiClient'
import { useState } from 'react'

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

const STATUS_LABEL: Record<RecruiterJob['status'], string> = {
  draft: 'Draft',
  published: 'Published',
  paused: 'Paused',
  closed: 'Closed',
}

const STATUS_TONE: Record<RecruiterJob['status'], BadgeTone> = {
  draft: 'neutral',
  published: 'success',
  paused: 'warning',
  closed: 'neutral',
}

function JobRow({ job, index }: { job: RecruiterJob; index: number }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['recruiter-jobs'] })
  // Shared by every action on this row — only one can ever be in flight/failing at once
  // (all four buttons are disabled together via isPending below), so one error slot is enough.
  const [actionError, setActionError] = useState<string | null>(null)

  function makeJobActionMutation(mutationFn: () => Promise<unknown>, failureMessage: string) {
    return {
      mutationFn,
      onSuccess: () => {
        setActionError(null)
        invalidate()
      },
      onError: (err: unknown) => {
        setActionError(err instanceof ApiError ? err.message : failureMessage)
      },
    }
  }

  const publishMutation = useMutation(makeJobActionMutation(() => publishRecruiterJob(job.id), 'Could not publish this job. Please try again.'))
  const pauseMutation = useMutation(makeJobActionMutation(() => pauseRecruiterJob(job.id), 'Could not pause this job. Please try again.'))
  const closeMutation = useMutation(makeJobActionMutation(() => closeRecruiterJob(job.id), 'Could not close this job. Please try again.'))
  const duplicateMutation = useMutation(
    makeJobActionMutation(() => duplicateRecruiterJob(job.id), 'Could not duplicate this job. Please try again.'),
  )

  const isPending =
    publishMutation.isPending || pauseMutation.isPending || closeMutation.isPending || duplicateMutation.isPending

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/recruiter/jobs/${job.id}/edit`} className="truncate text-sm font-medium text-ink-900 hover:underline">
            {job.title}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-700">
            <span>{EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}</span>
            <span aria-hidden="true">·</span>
            <span>{WORKPLACE_LABEL[job.workplaceType] ?? job.workplaceType}</span>
            {job.location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <MapPin size={11} aria-hidden="true" />
                  {job.location}
                </span>
              </>
            )}
          </p>
        </div>
        <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/recruiter/jobs/${job.id}/applications`}>
          <Button variant="secondary" size="sm">
            <Users size={13} aria-hidden="true" />
            View applications
          </Button>
        </Link>
        <Link to={`/recruiter/jobs/${job.id}/edit`}>
          <Button variant="secondary" size="sm">
            Edit
          </Button>
        </Link>
        {(job.status === 'draft' || job.status === 'paused') && (
          <Button variant="primary" size="sm" disabled={isPending} onClick={() => publishMutation.mutate()}>
            Publish
          </Button>
        )}
        {job.status === 'published' && (
          <Button variant="secondary" size="sm" disabled={isPending} onClick={() => pauseMutation.mutate()}>
            Pause
          </Button>
        )}
        {job.status !== 'closed' && (
          <Button variant="danger" size="sm" disabled={isPending} onClick={() => closeMutation.mutate()}>
            Close
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={isPending} onClick={() => duplicateMutation.mutate()}>
          Duplicate
        </Button>
      </div>
      {actionError && (
        <p role="alert" className="mt-2 text-xs text-conflict">
          {actionError}
        </p>
      )}
    </motion.div>
  )
}

export function RecruiterJobsPage() {
  const jobsQuery = useQuery({ queryKey: ['recruiter-jobs'], queryFn: fetchRecruiterJobs })
  const jobs = jobsQuery.data?.jobs ?? []

  return (
    <RecruiterLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-ink-900">Jobs</h1>
            <p className="mt-1 text-sm text-ink-700">Create, publish, and manage your job postings.</p>
          </div>
          <Link to="/recruiter/jobs/new">
            <Button variant="primary">Post a job</Button>
          </Link>
        </div>

        {jobsQuery.isLoading && (
          <div className="mt-6 flex flex-col gap-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {jobsQuery.isError && (
          <p role="alert" className="mt-6 text-sm text-conflict">
            Couldn't load your jobs. Please refresh the page to try again.
          </p>
        )}

        {!jobsQuery.isLoading && !jobsQuery.isError && jobs.length === 0 && (
          <div className="mt-8">
            <EmptyState
              icon={Briefcase}
              title="No jobs yet."
              description="Post your first job to start receiving applications."
              action={
                <Link to="/recruiter/jobs/new">
                  <Button variant="primary">Post a job</Button>
                </Link>
              }
            />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {jobs.map((job, index) => (
            <JobRow key={job.id} job={job} index={index} />
          ))}
        </div>
      </div>
    </RecruiterLayout>
  )
}
