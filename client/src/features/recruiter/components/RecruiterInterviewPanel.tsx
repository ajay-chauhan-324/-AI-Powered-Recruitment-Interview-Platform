import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, MapPin, Phone, Video, X } from 'lucide-react'
import { SidePanel } from '@/components/ui/SidePanel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MatchScoreGauge } from '@/components/ui/MatchScoreGauge'
import {
  cancelRecruiterInterview,
  fetchRecruiterApplication,
  rescheduleRecruiterInterview,
  type RecruiterInterview,
} from '@/features/recruiter/api/recruiterApi'
import { ApiError } from '@/lib/apiClient'

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
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

const LOCATION_ICON = { video: Video, phone: Phone, onsite: MapPin, custom: MapPin } as const

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The recruiter's real operational detail view for one calendar entry (CLAUDE.md §12/§13):
 * candidate, job, round, AI match, prior-round history, and reschedule/cancel/join actions —
 * not just a readout. Prior-round history and AI match come from the SAME
 * fetchRecruiterApplication endpoint the application detail page already uses (via the
 * interview's own applicationId) — no duplicate application-summary logic here. Reschedule/
 * cancel reuse the exact same conflict-safe InterviewService every other path uses.
 */
const MEETING_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  waiting: 'Waiting for the other participant',
  in_progress: 'In progress',
  ended: 'Ended',
}

export function RecruiterInterviewPanel({ interview, onClose }: { interview: RecruiterInterview; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [showReschedule, setShowReschedule] = useState(false)
  const [startLocal, setStartLocal] = useState(() => toDatetimeLocal(interview.startAt))
  const [error, setError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const applicationQuery = useQuery({
    queryKey: ['recruiter-application', interview.applicationId],
    queryFn: () => fetchRecruiterApplication(interview.applicationId!),
    enabled: Boolean(interview.applicationId),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['recruiter-interviews'] })
  }

  const rescheduleMutation = useMutation({
    mutationFn: () => rescheduleRecruiterInterview(interview.id, new Date(startLocal).toISOString()),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelRecruiterInterview(interview.id),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'),
  })

  const cancelled = interview.status === 'cancelled'
  const application = applicationQuery.data?.application
  const priorRounds = application?.rounds.filter((round) => round.order < interview.round) ?? []
  const LocationIcon = LOCATION_ICON[interview.locationType]

  return (
    <SidePanel title={interview.candidateName} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-md font-medium text-ink-900">
            {INTERVIEW_TYPE_LABEL[interview.interviewType] ?? interview.title}
            {interview.round > 1 ? ` · Round ${interview.round}` : ''}
          </p>
          <p className="mt-0.5 text-sm text-ink-700">
            {interview.job.title}
            {interview.job.companyName ? ` · ${interview.job.companyName}` : ''}
          </p>
          <Badge tone={cancelled ? 'neutral' : 'success'} className="mt-1.5">
            {cancelled ? 'Cancelled' : interview.status}
          </Badge>
        </div>

        <div className="rounded-md border border-hairline bg-paper-100 p-3">
          <p className="text-sm font-medium text-ink-900">{interview.candidateName}</p>
          <p className="text-sm text-ink-700">{interview.candidateEmail}</p>
          <p className="mt-2 font-mono text-sm tabular-nums text-ink-900">
            {new Date(interview.startAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
            {new Date(interview.startAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–
            {new Date(interview.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ({interview.timezone})
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-700">
            <LocationIcon size={13} aria-hidden="true" />
            {interview.locationType === 'video' && interview.meetingUrl && (
              <a href={interview.meetingUrl} target="_blank" rel="noreferrer" className="text-amber-600 underline">
                Join interview
              </a>
            )}
            {interview.locationType === 'onsite' && (interview.address || 'On-site')}
            {interview.locationType === 'phone' && 'Phone call'}
            {interview.locationType === 'custom' && 'Custom'}
          </p>
          {interview.locationType === 'video' && interview.meetingUrl && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(interview.meetingUrl).then(() => {
                    setLinkCopied(true)
                    setTimeout(() => setLinkCopied(false), 2000)
                  })
                }}
                className="flex min-h-8 items-center gap-1 rounded-pill border border-hairline px-2.5 text-xs font-medium text-ink-700 hover:text-ink-900"
              >
                <Copy size={12} aria-hidden="true" />
                {linkCopied ? 'Copied!' : 'Copy meeting link'}
              </button>
              {interview.meeting && (
                <span className="text-xs text-ink-500">{MEETING_STATUS_LABEL[interview.meeting.status]}</span>
              )}
            </div>
          )}
        </div>

        {application?.atsAnalysis && (
          <div className="flex items-center gap-3 rounded-md border border-hairline bg-paper-50 p-3">
            <MatchScoreGauge score={application.atsAnalysis.score} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-700">AI match</p>
              <p className="truncate text-xs text-ink-500 capitalize">{application.atsAnalysis.confidence} confidence</p>
            </div>
          </div>
        )}

        {priorRounds.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Previous rounds</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {priorRounds.map((round) => (
                <li key={round.order} className="flex items-center gap-1.5 text-sm text-ink-900">
                  {round.status === 'passed' ? (
                    <Check size={14} aria-hidden="true" className="text-available" />
                  ) : (
                    <X size={14} aria-hidden="true" className="text-conflict" />
                  )}
                  {round.title} — {round.status === 'passed' ? 'Passed' : 'Not advanced'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {interview.applicationId && (
          <Link to={`/recruiter/applications/${interview.applicationId}`}>
            <Button variant="secondary" size="sm" className="w-full">
              <ExternalLink size={13} aria-hidden="true" />
              View application
            </Button>
          </Link>
        )}

        {error && (
          <p role="alert" className="text-sm text-conflict">
            {error}
          </p>
        )}

        {!cancelled && (
          <div className="flex flex-col gap-3 border-t border-hairline pt-4">
            {showReschedule ? (
              <>
                <label className="flex flex-col gap-1 text-sm text-ink-700">
                  New start time
                  <input
                    type="datetime-local"
                    value={startLocal}
                    onChange={(event) => setStartLocal(event.target.value)}
                    className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={rescheduleMutation.isPending}
                    onClick={() => {
                      setError(null)
                      rescheduleMutation.mutate()
                    }}
                  >
                    Save new time
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowReschedule(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowReschedule(true)}>
                  Reschedule
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={cancelMutation.isPending}
                  onClick={() => {
                    if (window.confirm('Cancel this interview?')) {
                      setError(null)
                      cancelMutation.mutate()
                    }
                  }}
                >
                  Cancel interview
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  )
}
