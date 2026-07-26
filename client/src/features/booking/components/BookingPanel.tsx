import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanel } from '@/components/ui/SidePanel'
import { createAppointment } from '@/features/booking/api/bookingApi'
import { ApiConflictError, ApiError } from '@/lib/apiClient'
import { formatClockFromDate } from '@/features/calendar/lib/layout'

interface BookingPanelProps {
  initialStart: Date
  durationMinutes: number
  onClose: () => void
}

interface Alternative {
  start: string
  end: string
}

/**
 * The non-AI public booking path (Phase 7's AI conversation layer is
 * blocked on a provider API key — see CLAUDE.md §18's flow, steps 6-12,
 * implemented here directly against the same AppointmentService a future
 * AI tool call would use). Triggered by tapping an available slot on the
 * Day view canvas — never a drag, per CLAUDE.md §18.
 */
export function BookingPanel({ initialStart, durationMinutes, onClose }: BookingPanelProps) {
  const queryClient = useQueryClient()
  const [selectedStart, setSelectedStart] = useState(initialStart)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState('')
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [manageToken, setManageToken] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      createAppointment({
        name,
        email,
        purpose,
        startAt: selectedStart.toISOString(),
        durationMinutes,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: (data) => {
      setManageToken(data.manageToken)
      setAlternatives(null)
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: unknown) => {
      if (error instanceof ApiConflictError) {
        setAlternatives(error.alternatives)
        setFormError(error.message)
        return
      }
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    mutation.mutate()
  }

  const endAt = new Date(selectedStart.getTime() + durationMinutes * 60_000)
  const dateLabel = selectedStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  if (manageToken) {
    const manageUrl = `${window.location.origin}/manage/${manageToken}`
    return (
      <SidePanel title="Booked" onClose={onClose}>
        <div className="flex flex-col items-center gap-4 pt-6 text-center">
          <span
            aria-hidden="true"
            className="seal-in flex h-14 w-14 items-center justify-center rounded-full border border-amber-600 bg-amber-100 text-2xl text-ink-900"
          >
            ✓
          </span>
          <p className="text-md font-medium text-ink-900">
            Booked — {formatClockFromDate(selectedStart)} on {dateLabel}
          </p>
          <p className="text-sm text-ink-700">
            Save this link to reschedule or cancel later — it won't be shown again.
          </p>
          <div className="w-full rounded-md border border-hairline bg-paper-100 px-3 py-2">
            <p className="break-all font-mono text-xs text-ink-900">{manageUrl}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(manageUrl)
            }}
            className="rounded-pill border border-amber-600 bg-amber-100 px-4 py-1.5 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
          >
            Copy link
          </button>
        </div>
      </SidePanel>
    )
  }

  return (
    <SidePanel title="Book this time" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="font-mono text-sm tabular-nums text-ink-700">
          {formatClockFromDate(selectedStart)}–{formatClockFromDate(endAt)}, {dateLabel}
        </p>

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

        {formError && (
          <p role="alert" className="text-sm text-conflict">
            {formError}
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
                    setFormError(null)
                  }}
                  className="rounded-pill border border-amber-600 bg-amber-100 px-3 py-1 font-mono text-xs text-ink-900"
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
          className="mt-2 rounded-pill border border-amber-600 bg-amber-100 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
        >
          {mutation.isPending ? 'Booking…' : 'Confirm booking'}
        </button>
      </form>
    </SidePanel>
  )
}
