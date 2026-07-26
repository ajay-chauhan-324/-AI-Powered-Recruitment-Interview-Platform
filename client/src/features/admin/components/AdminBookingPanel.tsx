import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanel } from '@/components/ui/SidePanel'
import { createAdminAppointment } from '@/features/admin/api/adminApi'
import { ApiConflictError, ApiError } from '@/lib/apiClient'
import { formatClockFromDate } from '@/features/calendar/lib/layout'
import { DEFAULT_APPOINTMENT_DURATION_MINUTES } from '@/features/booking/constants'

interface AdminBookingPanelProps {
  initialStart: Date
  onClose: () => void
}

export function AdminBookingPanel({ initialStart, onClose }: AdminBookingPanelProps) {
  const queryClient = useQueryClient()
  const [selectedStart, setSelectedStart] = useState(initialStart)
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_APPOINTMENT_DURATION_MINUTES)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState('')
  const [alternatives, setAlternatives] = useState<Array<{ start: string; end: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      createAdminAppointment({
        name,
        email,
        purpose,
        startAt: selectedStart.toISOString(),
        durationMinutes,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-appointments'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      onClose()
    },
    onError: (err: unknown) => {
      if (err instanceof ApiConflictError) {
        setAlternatives(err.alternatives)
        setError(err.message)
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    mutation.mutate()
  }

  const endAt = new Date(selectedStart.getTime() + durationMinutes * 60_000)
  const dateLabel = selectedStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <SidePanel title="New appointment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="font-mono text-sm tabular-nums text-ink-700">
          {formatClockFromDate(selectedStart)}–{formatClockFromDate(endAt)}, {dateLabel}
        </p>

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
        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Purpose
          <textarea
            required
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            rows={3}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-conflict">
            {error}
          </p>
        )}

        {alternatives && alternatives.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-700">Try one of these times instead:</p>
            <div className="flex flex-wrap gap-2">
              {alternatives.map((alt) => (
                <button
                  key={alt.start}
                  type="button"
                  onClick={() => {
                    setSelectedStart(new Date(alt.start))
                    setAlternatives(null)
                    setError(null)
                  }}
                  className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 font-mono text-xs text-ink-900"
                >
                  {formatClockFromDate(new Date(alt.start))}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-2 flex min-h-11 items-center justify-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
        >
          {mutation.isPending ? 'Booking…' : 'Create appointment'}
        </button>
      </form>
    </SidePanel>
  )
}
