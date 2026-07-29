import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { Check, Clock, User, Video, X } from 'lucide-react'
import {
  fetchApplicationRoundAvailability,
  scheduleApplicationInterview,
  type ApplicationRound,
  type CandidateApplication,
} from '@/features/applications/api/applicationsApi'
import { ApiConflictError, ApiError } from '@/lib/apiClient'
import { Button } from '@/components/ui/Button'

const SEARCH_DAYS = 14
// Fallback only, used for the brief moment before the availability query resolves — every
// interview's real timezone comes from the owning recruiter's own calendar (CLAUDE.md §36
// second pivot: "the recruiter calendar becomes the source of truth"), returned by
// fetchApplicationRoundAvailability, never assumed to be any single fixed zone.
const FALLBACK_TIMEZONE = 'UTC'

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

interface Slot {
  start: string
  end: string
}

function groupSlotsByDay(slots: Slot[], dayFormatter: Intl.DateTimeFormat): Array<{ day: string; slots: Slot[] }> {
  const groups: Array<{ day: string; slots: Slot[] }> = []
  for (const slot of slots) {
    const day = dayFormatter.format(new Date(slot.start))
    const existing = groups.find((group) => group.day === day)
    if (existing) existing.slots.push(slot)
    else groups.push({ day, slots: [slot] })
  }
  return groups
}

interface InterviewSchedulerDialogProps {
  application: CandidateApplication
  round: ApplicationRound
  onClose: () => void
}

/**
 * A SECONDARY, manual-slot-picker booking surface — kept only as a debugging/fallback path
 * behind "Pick a time manually" on ApplicationsPage. The primary and intended booking
 * workflow is now the AI assistant (AiAssistantPage, via book_interview_round) per this
 * product's "the entire booking flow happens through AI chat" decision. Still reuses the
 * exact same building blocks the AI path uses under the hood: fetchApplicationRoundAvailability
 * (the owning recruiter's own calendar, via the same real AvailabilityService every booking
 * path uses) and scheduleApplicationInterview (the same service function the AI tool calls)
 * — no second scheduling engine, no invented slots, either way.
 */
export function InterviewSchedulerDialog({ application, round, onClose }: InterviewSchedulerDialogProps) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState(false)

  const now = new Date()
  const rangeEnd = new Date(now.getTime() + SEARCH_DAYS * 86_400_000)
  const availabilityKey = ['application-round-availability', application.id, round.order, round.durationMinutes]

  const availabilityQuery = useQuery({
    queryKey: availabilityKey,
    queryFn: () => fetchApplicationRoundAvailability(application.id, now, rangeEnd),
  })

  // Every recruiter owns their own calendar and timezone (CLAUDE.md §36 second pivot) — the
  // effective zone comes back on the availability response itself, never assumed up front.
  const timezone = availabilityQuery.data?.timezone ?? FALLBACK_TIMEZONE
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'short', day: 'numeric' }),
    [timezone],
  )
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }),
    [timezone],
  )

  // "No manual refresh required" (automatic slot assignment) — reuse the existing /calendar
  // real-time channel (server/src/sockets/socketServer.ts) so a slot another candidate just
  // took disappears here automatically, the same way the admin/recruiter calendar already
  // reacts to interview.created without a page reload.
  useEffect(() => {
    const socket = io('/calendar', { path: '/socket.io' })
    function refresh() {
      queryClient.invalidateQueries({ queryKey: availabilityKey })
    }
    socket.on('interview.created', refresh)
    socket.on('interview.cancelled', refresh)
    socket.on('availability.changed', refresh)
    return () => {
      socket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bookMutation = useMutation({
    mutationFn: (startAt: string) => scheduleApplicationInterview(application.id, startAt, timezone),
    onSuccess: () => {
      setError(null)
      setBooked(true)
      queryClient.invalidateQueries({ queryKey: ['my-applications'] })
      queryClient.invalidateQueries({ queryKey: ['my-interviews'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (err: unknown) => {
      if (err instanceof ApiConflictError) {
        setError('That slot has just been booked. Here are the next available times.')
        queryClient.invalidateQueries({ queryKey: availabilityKey })
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong booking that slot. Please try again.')
    },
  })

  const slots = availabilityQuery.data?.slots ?? []
  const groups = groupSlotsByDay(slots, dayFormatter)

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/30 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-lg border border-hairline bg-paper-50 shadow-sheet sm:rounded-lg sm:shadow-panel">
        <div className="flex shrink-0 items-center justify-between border-b border-hairline px-5 py-3.5">
          <h2 className="text-sm font-medium text-ink-900">Schedule {round.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-ink-500 hover:bg-paper-100 hover:text-ink-900"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {booked ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-available/10 text-available">
                <Check size={24} aria-hidden="true" />
              </div>
              <p className="text-md font-medium text-ink-900">Interview booked</p>
              <p className="text-sm text-ink-700">
                Your {round.title} for {application.job.title} is confirmed. Check My Applications or My Interviews for the details.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-700">
                <span className="inline-flex items-center gap-1">
                  <User size={12} aria-hidden="true" />
                  {round.interviewerName || 'Recruiter TBD'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} aria-hidden="true" />
                  {round.durationMinutes} min
                </span>
                <span className="inline-flex items-center gap-1">
                  <Video size={12} aria-hidden="true" />
                  {round.locationType === 'video' ? 'Online meeting' : (round.locationType ?? 'Video')}
                </span>
                <span>{INTERVIEW_TYPE_LABEL[round.type] ?? round.type}</span>
                <span className="font-mono">{timezone}</span>
              </div>

              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-500">Available slots</p>

              {availabilityQuery.isLoading && <p className="mt-3 text-sm text-ink-700">Loading available times…</p>}
              {!availabilityQuery.isLoading && groups.length === 0 && (
                <p className="mt-3 text-sm text-ink-700">No open times found in the next {SEARCH_DAYS} days.</p>
              )}

              <div className="mt-2 flex flex-col gap-3">
                {groups.map((group) => (
                  <div key={group.day}>
                    <p className="text-sm text-ink-700">{group.day}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          disabled={bookMutation.isPending}
                          onClick={() => {
                            setError(null)
                            bookMutation.mutate(slot.start)
                          }}
                          className="flex min-h-9 items-center rounded-pill border border-amber-600/40 bg-amber-100 px-3 text-sm font-medium text-ink-900 hover:border-amber-600 disabled:opacity-50"
                        >
                          {timeFormatter.format(new Date(slot.start))}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <p role="alert" className="mt-3 text-sm text-conflict">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-hairline p-4">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
