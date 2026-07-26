import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanel } from '@/components/ui/SidePanel'
import { cancelAdminAppointment, rescheduleAdminAppointment, type AdminAppointment } from '@/features/admin/api/adminApi'
import { ApiError } from '@/lib/apiClient'

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface AdminAppointmentPanelProps {
  appointment: AdminAppointment
  onClose: () => void
}

/**
 * Reschedule and duration changes ("resize", CLAUDE.md §20) happen through
 * editable form fields rather than a pointer-drag interaction — a
 * deliberate scope choice: this achieves the same outcome with full
 * keyboard accessibility built in from the start (CLAUDE.md §24 "keyboard
 * alternative to drag actions"), rather than building a bespoke drag/resize
 * handle and a *separate* keyboard path for it. Direct-manipulation drag
 * can be added later as a progressive enhancement on top of this working,
 * accessible foundation.
 */
export function AdminAppointmentPanel({ appointment, onClose }: AdminAppointmentPanelProps) {
  const queryClient = useQueryClient()
  const [startLocal, setStartLocal] = useState(() => toDatetimeLocal(appointment.startAt))
  const [durationMinutes, setDurationMinutes] = useState(appointment.durationMinutes)
  const [error, setError] = useState<string | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-appointments'] })
    queryClient.invalidateQueries({ queryKey: ['calendar'] })
  }

  const rescheduleMutation = useMutation({
    mutationFn: () =>
      rescheduleAdminAppointment(appointment.id, new Date(startLocal).toISOString(), durationMinutes),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelAdminAppointment(appointment.id),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  const cancelled = appointment.status === 'cancelled'

  return (
    <SidePanel title="Appointment" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-md font-medium text-ink-900">{appointment.name}</p>
          <p className="text-sm text-ink-700">{appointment.email}</p>
          <p className="mt-2 text-sm text-ink-700">{appointment.purpose}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-ink-500">
            {appointment.source} · {appointment.status}
          </p>
        </div>

        {cancelled ? (
          <p className="text-sm text-ink-700">This appointment has been cancelled.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Start
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(event) => setStartLocal(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Duration (minutes)
              <input
                type="number"
                min={5}
                step={5}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-conflict">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  rescheduleMutation.mutate()
                }}
                disabled={rescheduleMutation.isPending}
                className="rounded-pill border border-amber-600 bg-amber-100 px-4 py-1.5 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Cancel this appointment?')) {
                    setError(null)
                    cancelMutation.mutate()
                  }
                }}
                disabled={cancelMutation.isPending}
                className="rounded-pill border border-hairline px-4 py-1.5 text-sm font-medium text-ink-700 hover:text-ink-900 disabled:opacity-50"
              >
                Cancel appointment
              </button>
            </div>
          </>
        )}
      </div>
    </SidePanel>
  )
}
