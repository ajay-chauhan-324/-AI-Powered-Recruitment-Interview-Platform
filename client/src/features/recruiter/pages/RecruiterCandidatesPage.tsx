import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { useRecruiterApplications, type RecruiterApplicationWithJob } from '@/features/recruiter/hooks/useRecruiterApplications'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { MatchScoreGauge } from '@/components/ui/MatchScoreGauge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ApplicationStatus } from '@/features/recruiter/api/recruiterApi'

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

function CandidateRow({ application }: { application: RecruiterApplicationWithJob }) {
  const name = application.candidate?.name ?? 'Unknown candidate'
  return (
    <Link
      to={`/recruiter/applications/${application.id}`}
      className="flex items-center gap-3 rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag hover:border-amber-600/40"
    >
      <Avatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-ink-900">{name}</p>
          <Badge tone={STATUS_TONE[application.status]}>{STATUS_LABEL[application.status]}</Badge>
        </div>
        {application.candidate?.headline && <p className="truncate text-xs text-ink-700">{application.candidate.headline}</p>}
        <p className="mt-0.5 truncate text-xs text-ink-500">Applied to {application.jobTitle}</p>
      </div>
      {application.atsAnalysis && <MatchScoreGauge score={application.atsAnalysis.score} size="sm" />}
    </Link>
  )
}

export function RecruiterCandidatesPage() {
  const { applications, isLoading, isError } = useRecruiterApplications()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const sorted = [...applications].sort((a, b) => (b.atsAnalysis?.score ?? -1) - (a.atsAnalysis?.score ?? -1))
    if (!query) return sorted
    return sorted.filter((application) => {
      const haystack = [
        application.candidate?.name,
        application.candidate?.headline,
        application.jobTitle,
        ...(application.candidate?.skills ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [applications, search])

  return (
    <RecruiterLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">Candidates</h1>
        <p className="mt-1 text-sm text-ink-700">Every candidate who has applied across your active jobs, ranked by AI match.</p>

        <label className="relative mt-6 flex items-center">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-500" />
          <span className="sr-only">Search candidates</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, skill, or job…"
            className="w-full rounded-md border border-hairline bg-paper-50 py-2 pl-9 pr-3 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>

        {isLoading && (
          <div className="mt-6 flex flex-col gap-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {isError && (
          <p role="alert" className="mt-6 text-sm text-conflict">
            Couldn't load candidates. Please refresh the page to try again.
          </p>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="mt-8">
            <EmptyState
              icon={Users}
              title={applications.length === 0 ? 'No candidates yet.' : 'No candidates match your search.'}
              description={
                applications.length === 0
                  ? 'Candidates will appear here once they apply to your published jobs.'
                  : 'Try a different name, skill, or job title.'
              }
            />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {filtered.map((application) => (
            <CandidateRow key={application.id} application={application} />
          ))}
        </div>
      </div>
    </RecruiterLayout>
  )
}
