import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Briefcase, Calendar, Check, Lock, MapPin, Sparkles, Video, X } from 'lucide-react'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'
import {
  fetchMyApplications,
  type ApplicationRound,
  type ApplicationStatus,
  type CandidateApplication,
} from '@/features/applications/api/applicationsApi'
import { InterviewSchedulerDialog } from '@/features/applications/components/InterviewSchedulerDialog'
import { fetchMyInterviews } from '@/features/interviews/api/myInterviewsApi'
import { RescheduleDialog } from '@/features/interviews/components/RescheduleDialog'
import { CancelDialog } from '@/features/interviews/components/CancelDialog'
import { Countdown } from '@/features/interviews/components/Countdown'
import type { InterviewType, OwnerInterview } from '@/features/booking/api/bookingApi'
import { formatClockInTimeZone } from '@/features/calendar/lib/layout'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

const MEETING_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  waiting: 'Waiting for the other participant',
  in_progress: 'In progress',
  ended: 'Ended',
}

const JOIN_WINDOW_MINUTES_BEFORE = 15

function formatDateHeading(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

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

const INTERVIEW_TYPE_LABEL: Record<InterviewType, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical Interview',
  coding: 'Coding Interview',
  system_design: 'System Design Interview',
  behavioral: 'Behavioral Interview',
  managerial: 'Managerial Interview',
  final: 'Final Interview',
  panel: 'Panel Interview',
  custom: 'Interview',
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

type StepState = 'done' | 'current' | 'locked' | 'failed'

interface TimelineStep {
  key: string
  label: string
  state: StepState
  detail?: string
}

/** Ordinal position of each pre-interview application status — used only to decide how much
 * of the "Applied / Under Review / Shortlisted" prefix is already behind the candidate. Round
 * progress (below) is tracked independently via each round's own status, never inferred from
 * this ranking. */
const STATUS_RANK: Record<ApplicationStatus, number> = {
  applied: 0,
  under_review: 1,
  shortlisted: 2,
  interview_in_progress: 3,
  selected: 4,
  rejected: 0,
  withdrawn: 0,
}

/** Builds the single, unified journey a candidate sees (CLAUDE.md §10): submitted → reviewed
 * → shortlisted → every interview round in order → hired — with exactly one step ever marked
 * "current", matching whatever the candidate can actually act on right now. This is a pure
 * presentation layer over data the backend already computed (application.status,
 * rounds[].status); it never decides eligibility itself. */
function buildTimelineSteps(application: CandidateApplication): TimelineStep[] {
  const rank = STATUS_RANK[application.status]
  const raw = [
    { key: 'applied', label: 'Application Submitted', done: true, failed: false },
    { key: 'review', label: 'Under Review', done: rank >= 1, failed: false },
    { key: 'shortlisted', label: 'Shortlisted', done: rank >= 2, failed: false },
    ...application.rounds.map((round) => ({
      key: `round-${round.order}`,
      label: round.title,
      done: round.status === 'passed',
      failed: round.status === 'failed',
    })),
    { key: 'hired', label: 'Hired', done: application.status === 'selected', failed: false },
  ]

  let currentAssigned = false
  return raw.map((step): TimelineStep => {
    if (step.done) return { key: step.key, label: step.label, state: 'done' }
    if (step.failed) return { key: step.key, label: step.label, state: 'failed' }
    if (!currentAssigned) {
      currentAssigned = true
      return { key: step.key, label: step.label, state: 'current' }
    }
    return { key: step.key, label: step.label, state: 'locked' }
  })
}

/** The most important UI element on this page (CLAUDE.md §10/§12/§6): shows exactly where the
 * candidate stands in the FULL journey (not just interview rounds) — what's done, what they
 * can act on right now, and everything still ahead. Never lets them see or reach a round out
 * of sequence; that's enforced server-side, this is just a faithful readout of it. */
function ApplicationTimeline({ application }: { application: CandidateApplication }) {
  const isTerminal = application.status === 'rejected' || application.status === 'withdrawn'
  if (isTerminal) return null

  const steps = buildTimelineSteps(application)
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-hairline pt-3">
      {steps.map((step) => (
        <div key={step.key} className="flex items-center gap-2 text-xs">
          <span
            className={
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full ' +
              (step.state === 'done'
                ? 'bg-available text-paper-50'
                : step.state === 'failed'
                  ? 'bg-conflict text-paper-50'
                  : step.state === 'current'
                    ? 'border border-amber-600 text-amber-600'
                    : 'border border-hairline text-ink-500')
            }
          >
            {step.state === 'done' ? (
              <Check size={11} aria-hidden="true" />
            ) : step.state === 'failed' ? (
              <X size={11} aria-hidden="true" />
            ) : step.state === 'locked' ? (
              <Lock size={10} aria-hidden="true" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
            )}
          </span>
          <span
            className={
              (step.state === 'current' ? 'font-semibold' : 'font-medium') +
              ' ' +
              (step.state === 'locked' ? 'text-ink-500' : 'text-ink-900')
            }
          >
            {step.label}
          </span>
          {step.state === 'failed' && <span className="text-ink-500">Not advanced</span>}
          {step.state === 'current' && <span className="text-amber-600">Current stage</span>}
        </div>
      ))}
    </div>
  )
}

function ApplicationCard({
  application,
  interview,
  onSchedule,
  onReschedule,
  onCancel,
  index,
}: {
  application: CandidateApplication
  interview: OwnerInterview | undefined
  onSchedule: (round: ApplicationRound) => void
  onReschedule: (interview: OwnerInterview) => void
  onCancel: (interview: OwnerInterview) => void
  index: number
}) {
  const readyRound = application.rounds.find((round) => round.status === 'ready_to_book')
  const scheduledRound = application.rounds.find((round) => round.status === 'scheduled')
  const isTerminal = application.status === 'rejected' || application.status === 'withdrawn'
  const noRoundsUnlockedYet = !isTerminal && application.rounds.every((round) => round.status === 'locked')
  const waitingOnRecruiter =
    !isTerminal &&
    !noRoundsUnlockedYet &&
    application.status !== 'selected' &&
    !readyRound &&
    !scheduledRound

  const start = interview ? new Date(interview.startAt) : null
  const end = interview ? new Date(interview.endAt) : null
  const now = new Date()
  const isCancelled = interview?.status === 'cancelled'
  const isPast = end ? end.getTime() <= now.getTime() : false
  const canJoin =
    Boolean(interview && start && end) &&
    interview!.status === 'confirmed' &&
    Boolean(interview!.meetingUrl) &&
    now >= new Date(start!.getTime() - JOIN_WINDOW_MINUTES_BEFORE * 60_000) &&
    now < end!

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 sm:justify-start">
            <p className="truncate text-sm font-medium text-ink-900">{application.job.title}</p>
            <Badge tone={STATUS_TONE[application.status]} className="sm:hidden">
              {STATUS_LABEL[application.status]}
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-700">
            {application.job.companyName && (
              <>
                <span>{application.job.companyName}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{EMPLOYMENT_LABEL[application.job.employmentType] ?? application.job.employmentType}</span>
            <span aria-hidden="true">·</span>
            <span>{WORKPLACE_LABEL[application.job.workplaceType] ?? application.job.workplaceType}</span>
            {application.job.location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <MapPin size={11} aria-hidden="true" />
                  {application.job.location}
                </span>
              </>
            )}
          </p>

          {noRoundsUnlockedYet && (
            <p className="mt-2.5 text-xs text-ink-500">Waiting for the recruiter to review your application.</p>
          )}
          {waitingOnRecruiter && (
            <p className="mt-2.5 text-xs text-ink-500">Waiting for the recruiter to unlock your next round.</p>
          )}
          {application.status === 'selected' && (
            <p className="mt-2.5 text-xs font-medium text-available">Interview process complete — you passed every round.</p>
          )}

          {scheduledRound && interview && (
            <div className="mt-2.5 flex flex-col gap-1 rounded-md border border-hairline bg-paper-100 px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-sm tabular-nums text-ink-900">{formatDateHeading(start!)}</span>
                <span className="font-mono text-sm tabular-nums text-ink-700">
                  {formatClockInTimeZone(start!, interview.timezone)}–{formatClockInTimeZone(end!, interview.timezone)} ({interview.timezone})
                </span>
                {!isCancelled && !isPast && (
                  <Countdown startAt={start!} endAt={end!} className="text-xs font-medium text-amber-600" />
                )}
              </div>
              {interview.meetingType === 'online' && (
                <p className="flex items-center gap-1 text-xs text-ink-700">
                  <Video size={11} aria-hidden="true" />
                  Meeting: {MEETING_STATUS_LABEL[interview.meeting?.status ?? 'not_started']}
                </p>
              )}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {readyRound && (
              <>
                {/* Booking now happens entirely through the AI assistant, in plain language —
                    this is the primary and only intended booking workflow (see AiAssistantPage).
                    The manual time picker below remains reachable only as a secondary/debug
                    fallback. */}
                <Link to={`/ai?applicationId=${application.id}`}>
                  <Button variant="primary" size="sm">
                    <Sparkles size={13} aria-hidden="true" />
                    Book {INTERVIEW_TYPE_LABEL[readyRound.type]} with AI
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={() => onSchedule(readyRound)}
                  className="text-xs text-ink-500 underline decoration-dotted underline-offset-2 hover:text-ink-700"
                >
                  Pick a time manually
                </button>
              </>
            )}
            {!readyRound && scheduledRound && !interview && (
              <Link to="/interviews">
                <Button variant="secondary" size="sm">
                  View {INTERVIEW_TYPE_LABEL[scheduledRound.type]}
                </Button>
              </Link>
            )}
            {scheduledRound && interview && (
              <>
                {canJoin && (
                  <a href={interview.meetingUrl} target="_blank" rel="noreferrer">
                    <Button variant="primary" size="sm">
                      <Video size={13} aria-hidden="true" />
                      Join interview
                    </Button>
                  </a>
                )}
                {!isCancelled && !isPast && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => onReschedule(interview)}>
                      Reschedule
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => onCancel(interview)}>
                      Cancel
                    </Button>
                  </>
                )}
                <Link to="/interviews">
                  <Button variant="secondary" size="sm">
                    <Calendar size={13} aria-hidden="true" />
                    Details
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <Badge tone={STATUS_TONE[application.status]} className="hidden sm:inline-flex">
            {STATUS_LABEL[application.status]}
          </Badge>
        </div>
      </div>

      <ApplicationTimeline application={application} />
    </motion.div>
  )
}

export function ApplicationsPage() {
  const applicationsQuery = useQuery({ queryKey: ['my-applications'], queryFn: fetchMyApplications })
  // Shares the ['my-interviews'] cache with InterviewsPage — one real fetch, not a duplicate
  // API call, however many pages the candidate has visited this session.
  const interviewsQuery = useQuery({ queryKey: ['my-interviews'], queryFn: fetchMyInterviews })
  useRealtimeInvalidation([['my-applications'], ['my-interviews']])
  const applications = applicationsQuery.data?.applications ?? []
  const interviews = interviewsQuery.data?.interviews ?? []
  const [scheduleTarget, setScheduleTarget] = useState<{ application: CandidateApplication; round: ApplicationRound } | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<OwnerInterview | null>(null)
  const [cancelTarget, setCancelTarget] = useState<OwnerInterview | null>(null)

  return (
    <AuthenticatedLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">My Applications</h1>
        <p className="mt-1 text-sm text-ink-700">Track your progress through every application, from submission to hire.</p>

        {applicationsQuery.isLoading && (
          <div className="mt-6 flex flex-col gap-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {applicationsQuery.isError && (
          <p role="alert" className="mt-6 text-sm text-conflict">
            Couldn't load your applications. Please refresh the page to try again.
          </p>
        )}

        {!applicationsQuery.isLoading && !applicationsQuery.isError && applications.length === 0 && (
          <div className="mt-8">
            <EmptyState
              icon={Briefcase}
              title="No applications yet."
              description="Applications you submit will appear here with their current stage and progress."
              action={
                <Link to="/jobs">
                  <Button variant="primary">Browse jobs</Button>
                </Link>
              }
            />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {applications.map((application, index) => {
            const scheduledRound = application.rounds.find((round) => round.status === 'scheduled')
            const interview = scheduledRound?.interviewId
              ? interviews.find((candidate) => candidate.id === scheduledRound.interviewId)
              : undefined
            return (
              <ApplicationCard
                key={application.id}
                application={application}
                interview={interview}
                index={index}
                onSchedule={(round) => setScheduleTarget({ application, round })}
                onReschedule={setRescheduleTarget}
                onCancel={setCancelTarget}
              />
            )
          })}
        </div>
      </div>

      {scheduleTarget && (
        <InterviewSchedulerDialog
          application={scheduleTarget.application}
          round={scheduleTarget.round}
          onClose={() => setScheduleTarget(null)}
        />
      )}
      {rescheduleTarget && <RescheduleDialog interview={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />}
      {cancelTarget && <CancelDialog interview={cancelTarget} onClose={() => setCancelTarget(null)} />}
    </AuthenticatedLayout>
  )
}
