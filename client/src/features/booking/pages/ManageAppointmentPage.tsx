import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelAppointmentByToken,
  fetchAppointmentByToken,
  fetchAvailability,
  rescheduleAppointmentByToken,
} from '@/features/booking/api/bookingApi'
import { ApiError } from '@/lib/apiClient'
import { formatClockFromDate } from '@/features/calendar/lib/layout'

const RESCHEDULE_SEARCH_DAYS = 14

/**
 * Reached via the manage link returned once at booking time (CLAUDE.md
 * §19 — the raw token lives only in this URL, never in the database).
 * Possessing the token IS the authorization for this page; there's no
 * separate login.
 */
export function ManageAppointmentPage() {
  const { token = '' } = useParams<{ token: string }>()
  const queryClient = useQueryClient()
  const [showReschedule, setShowReschedule] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const appointmentQuery = useQuery({
    queryKey: ['manage-appointment', token],
    queryFn: () => fetchAppointmentByToken(token),
    retry: false,
  })

  const now = new Date()
  const rangeEnd = new Date(now.getTime() + RESCHEDULE_SEARCH_DAYS * 86_400_000)
  const durationMinutes = appointmentQuery.data?.appointment.durationMinutes ?? 30

  const availabilityQuery = useQuery({
    queryKey: ['manage-availability', token, durationMinutes],
    queryFn: () => fetchAvailability(now, rangeEnd, durationMinutes),
    enabled: showReschedule,
  })

  const rescheduleMutation = useMutation({
    mutationFn: (newStart: string) => rescheduleAppointmentByToken(token, newStart),
    onSuccess: () => {
      setShowReschedule(false)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['manage-appointment', token] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelAppointmentByToken(token),
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['manage-appointment', token] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    },
  })

  if (appointmentQuery.isLoading) {
    return <PageShell>Loading…</PageShell>
  }

  if (appointmentQuery.isError) {
    return (
      <PageShell>
        <p className="text-ink-900">This link is invalid or has expired.</p>
      </PageShell>
    )
  }

  const appointment = appointmentQuery.data!.appointment
  const start = new Date(appointment.startAt)
  const end = new Date(appointment.endAt)
  const dateLabel = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <PageShell>
      <h1 className="text-lg font-medium text-ink-900">Your appointment</h1>
      <p className="mt-2 font-mono text-sm tabular-nums text-ink-700">
        {formatClockFromDate(start)}–{formatClockFromDate(end)}, {dateLabel}
      </p>
      <p className="mt-1 text-sm text-ink-700">{appointment.purpose}</p>

      {appointment.status === 'cancelled' ? (
        <p className="mt-6 text-sm text-ink-700">This appointment has been cancelled.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {actionError && (
            <p role="alert" className="text-sm text-conflict">
              {actionError}
            </p>
          )}

          {!showReschedule && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReschedule(true)}
                className="rounded-pill border border-amber-600 bg-amber-100 px-4 py-1.5 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Cancel this appointment?')) cancelMutation.mutate()
                }}
                className="rounded-pill border border-hairline px-4 py-1.5 text-sm font-medium text-ink-700 hover:text-ink-900"
              >
                Cancel
              </button>
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
                    className="rounded-pill border border-amber-600 bg-amber-100 px-3 py-1 font-mono text-xs text-ink-900 disabled:opacity-50"
                  >
                    {new Date(slot.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                    {formatClockFromDate(new Date(slot.start))}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowReschedule(false)}
                className="mt-2 self-start text-sm text-ink-700 hover:text-ink-900"
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
  return (
    <div className="flex min-h-dvh items-start justify-center bg-paper-50 px-4 py-12 sm:items-center">
      <div className="w-full max-w-md rounded-lg border border-hairline bg-paper-50 p-6 shadow-panel">
        <span className="font-mono text-sm font-medium tracking-wide text-ink-900">The Ledger</span>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
