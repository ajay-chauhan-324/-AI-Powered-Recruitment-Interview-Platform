import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAvailability, type OwnerInterview } from '@/features/booking/api/bookingApi'
import { rescheduleMyInterview } from '@/features/interviews/api/myInterviewsApi'
import { formatClockFromDate } from '@/features/calendar/lib/layout'
import { ApiError } from '@/lib/apiClient'
import { Button } from '@/components/ui/Button'

const RESCHEDULE_SEARCH_DAYS = 14

function formatDateHeading(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

interface RescheduleDialogProps {
  interview: OwnerInterview
  onClose: () => void
}

/** Shared by InterviewsPage and ApplicationsPage — one candidate-facing reschedule flow, not
 * duplicated per page. Reuses the same real availability API and rescheduleMyInterview REST
 * call either page would otherwise have had to call itself. */
export function RescheduleDialog({ interview, onClose }: RescheduleDialogProps) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const rangeEnd = new Date(now.getTime() + RESCHEDULE_SEARCH_DAYS * 86_400_000)

  const availabilityQuery = useQuery({
    queryKey: ['my-interview-availability', interview.id, interview.durationMinutes],
    queryFn: () => fetchAvailability(now, rangeEnd, interview.durationMinutes),
  })

  const mutation = useMutation({
    mutationFn: (newStart: string) => rescheduleMyInterview(interview.id, newStart),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-interviews'] })
      queryClient.invalidateQueries({ queryKey: ['my-applications'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  const slots = availabilityQuery.data?.slots ?? []

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/30 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-lg border border-hairline bg-paper-50 p-5 shadow-sheet sm:rounded-lg sm:shadow-panel">
        <h2 className="text-md font-medium text-ink-900">Reschedule "{interview.title}"</h2>
        <p className="mt-1 text-sm text-ink-700">
          Choose a new time within the next {RESCHEDULE_SEARCH_DAYS} days. Times shown in your local timezone
          ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
        </p>

        {availabilityQuery.isLoading && <p className="mt-4 text-sm text-ink-700">Loading available times…</p>}
        {!availabilityQuery.isLoading && slots.length === 0 && (
          <p className="mt-4 text-sm text-ink-700">No open times found in this window.</p>
        )}

        <div className="mt-4 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {slots.map((slot) => {
            const start = new Date(slot.start)
            return (
              <button
                key={slot.start}
                type="button"
                onClick={() => {
                  setError(null)
                  mutation.mutate(slot.start)
                }}
                disabled={mutation.isPending}
                className="flex min-h-11 items-center justify-between rounded-md border border-hairline px-3 text-sm text-ink-900 hover:border-amber-600/40 disabled:opacity-50"
              >
                <span>{formatDateHeading(start)}</span>
                <span className="font-mono tabular-nums text-ink-700">{formatClockFromDate(start)}</span>
              </button>
            )
          })}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-conflict">
            {error}
          </p>
        )}

        <Button variant="secondary" onClick={onClose} className="mt-4 w-full">
          Close
        </Button>
      </div>
    </div>
  )
}
