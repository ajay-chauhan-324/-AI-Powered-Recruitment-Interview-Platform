import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelInterviewByToken,
  fetchAvailability,
  fetchInterviewByToken,
  rescheduleInterviewByToken,
  type InterviewType,
} from '@/features/booking/api/bookingApi'
import { buildIcsDataUrl } from '@/features/booking/lib/ics'
import { ApiError } from '@/lib/apiClient'
import { formatClockFromDate } from '@/features/calendar/lib/layout'
import { StandaloneCard } from '@/components/layout/StandaloneCard'

const RESCHEDULE_SEARCH_DAYS = 14
const JOIN_WINDOW_MINUTES_BEFORE = 15

type LiveStatus = 'upcoming' | 'starting_soon' | 'in_progress' | 'completed'

/**
 * A real (not faked) join-readiness computation from the actual scheduled times — this is
 * the "interview lobby" concept: knowing whether it's too early, time to join, or over, and
 * surfacing the meeting link prominently only when it's actually relevant. There is no
 * in-house video/audio calling here — "join" always means opening the meeting link the
 * recruiter/interviewer configured (Zoom/Meet/etc.), never a built-in call. Real-time video
 * would need a third-party provider (e.g. Daily.co, Twilio Video, a Zoom/Meet SDK) and
 * credentials this project doesn't have configured; see README "Known notes".
 */
function computeLiveStatus(now: Date, start: Date, end: Date): LiveStatus {
  if (now >= end) return 'completed'
  if (now >= start) return 'in_progress'
  if (start.getTime() - now.getTime() <= JOIN_WINDOW_MINUTES_BEFORE * 60_000) return 'starting_soon'
  return 'upcoming'
}

const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  upcoming: 'Upcoming',
  starting_soon: 'Starting soon',
  in_progress: 'In progress',
  completed: 'Completed',
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

/**
 * Reached via the manage link returned once at booking time (the raw token lives only in
 * this URL, never in the database). Possessing the token IS the authorization for this
 * page; there's no separate login.
 */
export function ManageInterviewPage() {
  const { token = '' } = useParams<{ token: string }>()
  const queryClient = useQueryClient()
  const [showReschedule, setShowReschedule] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const interviewQuery = useQuery({
    queryKey: ['manage-interview', token],
    queryFn: () => fetchInterviewByToken(token),
    retry: false,
  })

  const now = new Date()
  const rangeEnd = new Date(now.getTime() + RESCHEDULE_SEARCH_DAYS * 86_400_000)
  const durationMinutes = interviewQuery.data?.interview.durationMinutes ?? 30

  const availabilityQuery = useQuery({
    queryKey: ['manage-availability', token, durationMinutes],
    queryFn: () => fetchAvailability(now, rangeEnd, durationMinutes),
    enabled: showReschedule,
  })

  const rescheduleMutation = useMutation({
    mutationFn: (newStart: string) => rescheduleInterviewByToken(token, newStart),
    onSuccess: () => {
      setShowReschedule(false)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['manage-interview', token] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelInterviewByToken(token),
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['manage-interview', token] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    },
  })

  if (interviewQuery.isLoading) {
    return <PageShell>Loading…</PageShell>
  }

  if (interviewQuery.isError) {
    return (
      <PageShell>
        <p className="text-ink-900">This link is invalid or has expired.</p>
      </PageShell>
    )
  }

  const interview = interviewQuery.data!.interview
  const start = new Date(interview.startAt)
  const end = new Date(interview.endAt)
  const dateLabel = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const typeLabel = INTERVIEW_TYPE_LABEL[interview.interviewType]
  const liveStatus = interview.status === 'cancelled' ? null : computeLiveStatus(new Date(), start, end)
  const canJoinNow = liveStatus === 'starting_soon' || liveStatus === 'in_progress'
  const icsUrl = buildIcsDataUrl({
    uid: `${interview.id}@the-ledger`,
    title: typeLabel,
    description: interview.description || undefined,
    location: interview.locationType === 'video' ? interview.meetingUrl : interview.address || undefined,
    startAt: start,
    endAt: end,
  })

  return (
    <PageShell>
      <h1 className="text-lg font-medium text-ink-900">Hi {interview.candidateName.split(' ')[0]}, here's your interview</h1>
      <div className="mt-3 flex items-center gap-2">
        <p className="text-sm font-medium text-ink-900">
          {typeLabel}
          {interview.round > 1 ? ` · Round ${interview.round}` : ''}
        </p>
        {liveStatus && (
          <span
            className={
              'rounded-pill px-2 py-0.5 text-xs font-medium ' +
              (liveStatus === 'in_progress' || liveStatus === 'starting_soon'
                ? 'border border-amber-600/40 bg-amber-100 text-ink-900'
                : 'border border-hairline text-ink-700')
            }
          >
            {LIVE_STATUS_LABEL[liveStatus]}
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-sm tabular-nums text-ink-700">
        {formatClockFromDate(start)}–{formatClockFromDate(end)}, {dateLabel}
      </p>
      <p className="text-xs text-ink-500">{interview.timezone}</p>

      {interview.locationType === 'video' && interview.meetingUrl && (
        <div className="mt-3 rounded-md border border-hairline bg-paper-100 p-3">
          {canJoinNow ? (
            <a
              href={interview.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
            >
              Join interview
            </a>
          ) : (
            <p className="text-sm text-ink-700">
              Meeting link:{' '}
              <a href={interview.meetingUrl} className="break-all text-amber-600 underline" target="_blank" rel="noreferrer">
                {interview.meetingUrl}
              </a>
            </p>
          )}
        </div>
      )}
      {interview.locationType === 'onsite' && interview.address && (
        <p className="mt-2 text-sm text-ink-700">Location: {interview.address}</p>
      )}
      {interview.locationType === 'phone' && <p className="mt-2 text-sm text-ink-700">Format: Phone call</p>}

      {interview.status === 'cancelled' ? (
        <p className="mt-6 text-sm text-ink-700">This interview has been cancelled.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {actionError && (
            <p role="alert" className="text-sm text-conflict">
              {actionError}
            </p>
          )}

          {!showReschedule && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowReschedule(true)}
                className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Cancel this interview?')) cancelMutation.mutate()
                }}
                className="flex min-h-11 items-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900"
              >
                Cancel
              </button>
              <a
                href={icsUrl}
                download="interview.ics"
                className="flex min-h-11 items-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900"
              >
                Add to calendar
              </a>
            </div>
          )}

          {showReschedule && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-700">Pick a new time:</p>
              {availabilityQuery.isLoading && <p className="text-sm text-ink-700">Loading times…</p>}
              <div className="flex flex-wrap gap-2">
                {availabilityQuery.data?.slots.slice(0, 12).map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => rescheduleMutation.mutate(slot.start)}
                    disabled={rescheduleMutation.isPending}
                    className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 font-mono text-xs text-ink-900 disabled:opacity-50"
                  >
                    {new Date(slot.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                    {formatClockFromDate(new Date(slot.start))}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowReschedule(false)}
                className="mt-2 flex min-h-11 items-center self-start px-1 text-sm text-ink-700 hover:text-ink-900"
              >
                Cancel reschedule
              </button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <StandaloneCard title="The Ledger">{children}</StandaloneCard>
}
