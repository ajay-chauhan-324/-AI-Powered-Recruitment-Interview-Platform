import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  Lock,
  Mail,
  MapPin,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Video,
  X,
} from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import {
  applicationCandidatePhotoUrl,
  applicationResumeDownloadUrl,
  fetchRecruiterApplication,
  recordRoundOutcome,
  updateApplicationNotes,
  updateApplicationStatus,
  type ApplicationStatus,
  type RecruiterApplicationRound,
} from '@/features/recruiter/api/recruiterApi'
import { ApiError } from '@/lib/apiClient'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MatchScoreGauge } from '@/components/ui/MatchScoreGauge'
import { Skeleton } from '@/components/ui/Skeleton'
import { SkillChip } from '@/components/ui/SkillChip'

/** Every status the application can be in (display only) — `interview_in_progress` and
 * `selected` are round-driven and never chosen from the manual dropdown below. */
const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  interview_in_progress: 'Interviewing',
  selected: 'Selected',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

const STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  applied: 'neutral',
  under_review: 'info',
  shortlisted: 'warning',
  interview_in_progress: 'warning',
  selected: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
}

/** The statuses a recruiter may set by hand (application.service.ts's
 * MANUAL_APPLICATION_STATUSES) — the server rejects anything else from this dropdown. */
const MANUAL_STATUS_OPTIONS: Array<{ value: ApplicationStatus; label: string }> = [
  { value: 'under_review', label: 'Under Review' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const CONFIDENCE_TONE: Record<string, BadgeTone> = { high: 'success', medium: 'warning', low: 'neutral' }

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700">{title}</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-900">
        {items.map((item, index) => (
          <li key={index}>· {item}</li>
        ))}
      </ul>
    </div>
  )
}

/** A faithful readout of the candidate's own round progression — the recruiter sees the exact
 * same sequence the candidate does, never more than one round unlockable ahead (enforced
 * server-side in application.service.ts's nextUnlockableOrder). */
function RoundTimeline({ rounds }: { rounds: RecruiterApplicationRound[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rounds.map((round) => {
        const isDone = round.status === 'passed'
        const isFailed = round.status === 'failed'
        const isActionable = round.status === 'ready_to_book' || round.status === 'scheduled'
        return (
          <div key={round.order} className="flex items-center gap-2 text-sm">
            <span
              className={
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ' +
                (isDone
                  ? 'bg-available text-paper-50'
                  : isFailed
                    ? 'bg-conflict text-paper-50'
                    : isActionable
                      ? 'border border-amber-600 text-amber-600'
                      : 'border border-hairline text-ink-500')
              }
            >
              {isDone ? (
                <Check size={12} aria-hidden="true" />
              ) : isFailed ? (
                <X size={12} aria-hidden="true" />
              ) : round.status === 'locked' ? (
                <Lock size={11} aria-hidden="true" />
              ) : (
                round.order
              )}
            </span>
            <span className={'font-medium ' + (round.status === 'locked' ? 'text-ink-500' : 'text-ink-900')}>{round.title}</span>
            <span className="text-xs text-ink-500">
              {round.status === 'locked' && 'Locked'}
              {round.status === 'ready_to_book' && 'Unlocked · waiting for candidate to book'}
              {round.status === 'scheduled' && 'Scheduled'}
              {round.status === 'passed' && 'Passed'}
              {round.status === 'failed' && 'Not advanced'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function RecruiterApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const applicationQuery = useQuery({
    queryKey: ['recruiter-application', id],
    queryFn: () => fetchRecruiterApplication(id!),
    enabled: Boolean(id),
  })
  const application = applicationQuery.data?.application

  const [notes, setNotes] = useState('')
  // Tracks WHICH application's notes are currently loaded, not just whether notes have ever
  // been initialized — React Router keeps this component instance mounted across navigations
  // between two different applications' detail pages (no `key` on the route element), so a
  // plain "has this run once" flag would leave the previous candidate's notes showing until a
  // hard reload. Re-keying to the id makes this re-initialize every time the id actually changes.
  const [notesInitializedForId, setNotesInitializedForId] = useState<string | null>(null)
  if (application && notesInitializedForId !== application.id) {
    setNotes(application.recruiterNotes)
    setNotesInitializedForId(application.id)
  }

  const [outcomeError, setOutcomeError] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['recruiter-application', id] })
    queryClient.invalidateQueries({ queryKey: ['job-applications'] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: ApplicationStatus) => updateApplicationStatus(id!, status),
    onSuccess: invalidate,
  })

  const notesMutation = useMutation({
    mutationFn: () => updateApplicationNotes(id!, notes),
    onSuccess: invalidate,
  })

  const outcomeMutation = useMutation({
    mutationFn: ({ order, outcome }: { order: number; outcome: 'passed' | 'failed' }) => recordRoundOutcome(id!, order, outcome),
    onSuccess: () => {
      setOutcomeError(null)
      invalidate()
    },
    onError: (err: unknown) => {
      setOutcomeError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  if (applicationQuery.isError) {
    return (
      <RecruiterLayout>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <p role="alert" className="text-sm text-conflict">
            {applicationQuery.error instanceof ApiError ? applicationQuery.error.message : 'Could not load this application.'}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => applicationQuery.refetch()}>
              Try again
            </Button>
            <Link to="/recruiter/candidates" className="text-sm text-ink-700 hover:text-ink-900">
              Back to candidates
            </Link>
          </div>
        </div>
      </RecruiterLayout>
    )
  }

  if (applicationQuery.isLoading || !application) {
    return (
      <RecruiterLayout>
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </RecruiterLayout>
    )
  }

  const candidateName = application.candidate?.name ?? 'Unknown candidate'
  const isTerminal = application.status === 'rejected' || application.status === 'withdrawn'
  const scheduledRound = application.rounds.find((round) => round.status === 'scheduled')

  return (
    <RecruiterLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to={`/recruiter/jobs/${application.jobId}/applications`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to applications
        </Link>

        {/* Candidate profile */}
        <div className="mt-3 flex flex-col gap-4 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag sm:flex-row sm:items-start">
          <Avatar name={candidateName} size="lg" photoUrl={application.candidate?.photoUrl ? applicationCandidatePhotoUrl(application.id) : undefined} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-medium text-ink-900">{candidateName}</h1>
              <Badge tone={STATUS_TONE[application.status]}>{STATUS_LABEL[application.status]}</Badge>
            </div>
            {application.candidate?.headline && <p className="mt-1 text-sm text-ink-700">{application.candidate.headline}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-700">
              {application.candidate?.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail size={12} aria-hidden="true" />
                  {application.candidate.email}
                </span>
              )}
              {application.candidate?.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} aria-hidden="true" />
                  {application.candidate.location}
                </span>
              )}
            </div>
            {application.candidate?.about && <p className="mt-2 text-sm text-ink-700">{application.candidate.about}</p>}
            {application.candidate?.skills && application.candidate.skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {application.candidate.skills.map((skill) => (
                  <SkillChip key={skill} label={skill} tone={application.atsAnalysis?.matchedSkills.includes(skill) ? 'matched' : 'neutral'} />
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={applicationResumeDownloadUrl(application.id)}>
                <Button variant="secondary" size="sm">
                  <Download size={13} aria-hidden="true" />
                  Resume
                </Button>
              </a>
              {application.candidate?.linkedIn && (
                <a href={application.candidate.linkedIn} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    <ExternalLink size={13} aria-hidden="true" />
                    LinkedIn
                  </Button>
                </a>
              )}
              {application.candidate?.github && (
                <a href={application.candidate.github} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    <ExternalLink size={13} aria-hidden="true" />
                    GitHub
                  </Button>
                </a>
              )}
              {application.candidate?.portfolioUrl && (
                <a href={application.candidate.portfolioUrl} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    <ExternalLink size={13} aria-hidden="true" />
                    Portfolio
                  </Button>
                </a>
              )}
            </div>

            {application.candidate?.education && application.candidate.education.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Education</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-900">
                  {application.candidate.education.map((entry, index) => (
                    <li key={index}>
                      {entry.institution}
                      {entry.degree && ` — ${entry.degree}`}
                      {entry.fieldOfStudy && `, ${entry.fieldOfStudy}`}
                      {entry.endYear && ` (${entry.endYear})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {application.candidate?.experience && application.candidate.experience.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Experience</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-900">
                  {application.candidate.experience.map((entry, index) => (
                    <li key={index}>
                      {entry.title} — {entry.company}
                      {(entry.startDate || entry.endDate) && (
                        <span className="text-ink-700">
                          {' '}
                          ({entry.startDate || '?'}–{entry.endDate || 'present'})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {application.candidate?.projects && application.candidate.projects.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Projects</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-900">
                  {application.candidate.projects.map((entry, index) => (
                    <li key={index}>
                      {entry.url ? (
                        <a href={entry.url} target="_blank" rel="noreferrer" className="underline hover:text-amber-600">
                          {entry.title}
                        </a>
                      ) : (
                        entry.title
                      )}
                      {entry.description && <span className="text-ink-700"> — {entry.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Round timeline */}
        <section className="mt-4 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
          <h2 className="text-md font-medium text-ink-900">Interview pipeline</h2>
          <div className="mt-3">
            <RoundTimeline rounds={application.rounds} />
          </div>
          {isTerminal && (
            <Badge tone="danger" className="mt-3 w-fit">
              {application.status === 'rejected' ? 'Not selected' : 'Withdrawn'}
            </Badge>
          )}
        </section>

        {/* Quick actions + status */}
        <section className="mt-4 flex flex-col gap-3 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Status
            <select
              value={MANUAL_STATUS_OPTIONS.some((option) => option.value === application.status) ? application.status : ''}
              onChange={(event) => statusMutation.mutate(event.target.value as ApplicationStatus)}
              disabled={statusMutation.isPending}
              className="w-fit rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            >
              {!MANUAL_STATUS_OPTIONS.some((option) => option.value === application.status) && (
                <option value="" disabled>
                  {STATUS_LABEL[application.status]}
                </option>
              )}
              {MANUAL_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => statusMutation.mutate('shortlisted')}
              disabled={statusMutation.isPending || application.status === 'shortlisted'}
            >
              <ThumbsUp size={14} aria-hidden="true" />
              Shortlist
            </Button>
            <Button
              variant="danger"
              onClick={() => statusMutation.mutate('rejected')}
              disabled={statusMutation.isPending || application.status === 'rejected'}
            >
              <ThumbsDown size={14} aria-hidden="true" />
              Reject
            </Button>
          </div>
        </section>

        {/* AI analysis */}
        {application.atsAnalysis ? (
          <section className="mt-4 flex flex-col gap-4 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
            <div className="flex items-center gap-2">
              <Sparkles size={16} aria-hidden="true" className="text-amber-600" />
              <h2 className="text-md font-medium text-ink-900">AI analysis</h2>
              <Badge tone={CONFIDENCE_TONE[application.atsAnalysis.confidence] ?? 'neutral'} className="ml-auto capitalize">
                {application.atsAnalysis.confidence} confidence
              </Badge>
            </div>
            <MatchScoreGauge score={application.atsAnalysis.score} size="lg" showLabel />

            {(application.atsAnalysis.matchedSkills.length > 0 || application.atsAnalysis.missingSkills.length > 0) && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Skill alignment</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {application.atsAnalysis.matchedSkills.map((skill) => (
                    <SkillChip key={`m-${skill}`} label={skill} tone="matched" />
                  ))}
                  {application.atsAnalysis.missingSkills.map((skill) => (
                    <SkillChip key={`x-${skill}`} label={skill} tone="missing" />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ListSection title="Strengths" items={application.atsAnalysis.strengths} />
              <ListSection title="Gaps" items={application.atsAnalysis.gaps} />
              <ListSection title="Recommendation" items={application.atsAnalysis.recommendations} />
              <ListSection title="Evidence" items={application.atsAnalysis.evidence} />
            </div>
          </section>
        ) : (
          <p className="mt-4 rounded-md border border-hairline bg-paper-50 px-4 py-3 text-sm text-ink-700">
            AI analysis is not available for this application. You can still review it manually.
          </p>
        )}

        {/* Notes */}
        <section className="mt-4 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
          <h2 className="text-md font-medium text-ink-900">Notes</h2>
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add private notes about this candidate…"
            className="mt-2 w-full rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
          <Button variant="secondary" size="sm" onClick={() => notesMutation.mutate()} disabled={notesMutation.isPending} className="mt-3">
            {notesMutation.isPending ? 'Saving…' : 'Save notes'}
          </Button>
        </section>

        {/* Mark scheduled round's outcome */}
        {scheduledRound && (
          <section className="mt-4 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
            <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
              <Video size={16} aria-hidden="true" className="text-amber-600" />
              {scheduledRound.title} is scheduled
            </h2>
            <p className="mt-1 text-sm text-ink-700">Once the interview has happened, record the outcome.</p>
            {outcomeError && (
              <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-conflict">
                <X size={14} aria-hidden="true" />
                {outcomeError}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                disabled={outcomeMutation.isPending}
                onClick={() => outcomeMutation.mutate({ order: scheduledRound.order, outcome: 'passed' })}
              >
                <ThumbsUp size={14} aria-hidden="true" />
                Mark passed
              </Button>
              <Button
                variant="danger"
                disabled={outcomeMutation.isPending}
                onClick={() => outcomeMutation.mutate({ order: scheduledRound.order, outcome: 'failed' })}
              >
                <ThumbsDown size={14} aria-hidden="true" />
                Mark failed
              </Button>
            </div>
          </section>
        )}
      </div>
    </RecruiterLayout>
  )
}
