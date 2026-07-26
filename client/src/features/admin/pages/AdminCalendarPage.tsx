import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminAppointments, fetchAdminBlockedSlots, adminLogout, type AdminAppointment } from '@/features/admin/api/adminApi'
import { AdminAppointmentPanel } from '@/features/admin/components/AdminAppointmentPanel'
import { AdminBookingPanel } from '@/features/admin/components/AdminBookingPanel'
import { AppointmentTag } from '@/features/calendar/components/AppointmentTag'
import { BlockedRange } from '@/features/calendar/components/BlockedRange'
import { NowIndicator } from '@/features/calendar/components/NowIndicator'
import { getDayRange, addPeriod, isSameLocalDay } from '@/lib/dateContext'
import { HOUR_ROW_HEIGHT, clipRangeToDay, minutesToOffset, offsetForDate, offsetToTimeOfDay } from '@/features/calendar/lib/layout'
import { computeDefaultBookingStart } from '@/features/booking/constants'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
})

// Matches the public Day view (TimeCanvas.tsx) — without this, the admin canvas opens
// scrolled to midnight instead of near the current time / working hours.
const DEFAULT_SCROLL_HOUR = 7

/**
 * Admin-only Day view: full appointment detail, all statuses (including
 * cancelled, per CLAUDE.md §8's historical-visibility requirement), create/
 * reschedule/cancel. Week/Month admin views are deferred — a single Day
 * view covers everything CLAUDE.md §20 asks for (view/reschedule/resize/
 * cancel/create/blocked-time) without the added surface area of porting
 * the whole zoom-level system into an authenticated context.
 */
export function AdminCalendarPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedAppointment, setSelectedAppointment] = useState<AdminAppointment | null>(null)
  const [bookingDraftStart, setBookingDraftStart] = useState<Date | null>(null)

  const range = useMemo(() => getDayRange(anchorDate), [anchorDate])
  const now = useMemo(() => new Date(), [])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const defaultTarget = minutesToOffset(DEFAULT_SCROLL_HOUR, 0)
    const nowTarget = isSameLocalDay(anchorDate, now) ? offsetForDate(now) - 120 : defaultTarget
    node.scrollTop = Math.max(0, Math.min(defaultTarget, nowTarget))
  }, [anchorDate, now])

  // The keyboard-accessible "New appointment" button's default time should reflect the day
  // being viewed, not always "now" — an admin who's navigated to next week and hits this
  // button expects a draft on the day they're looking at, same as clicking the rail would give.
  function defaultBookingStartForViewedDay(): Date {
    if (isSameLocalDay(anchorDate, now)) return computeDefaultBookingStart(now)
    const start = new Date(anchorDate)
    start.setHours(9, 0, 0, 0)
    return start
  }

  const appointmentsQuery = useQuery({
    queryKey: ['admin-appointments', range.start.toISOString(), range.end.toISOString()],
    queryFn: () => fetchAdminAppointments(range.start, range.end),
  })
  const blockedSlotsQuery = useQuery({
    queryKey: ['admin-blocked-slots', range.start.toISOString(), range.end.toISOString()],
    queryFn: () => fetchAdminBlockedSlots(range.start, range.end),
  })

  const logoutMutation = useMutation({
    mutationFn: () => adminLogout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-session'] })
      navigate('/admin/login', { replace: true })
    },
  })

  function handleRailClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const { hour, minute } = offsetToTimeOfDay(event.clientY - rect.top)
    const clicked = new Date(range.start)
    clicked.setHours(hour, minute, 0, 0)
    setBookingDraftStart(clicked)
  }

  const appointments = appointmentsQuery.data?.appointments ?? []
  const blockedSlots = blockedSlotsQuery.data?.blockedSlots ?? []

  return (
    <div className="flex h-dvh flex-col bg-paper-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm font-medium tracking-wide text-ink-900">The Ledger — Admin</span>
          <nav className="flex items-center text-sm text-ink-700">
            <span className="flex min-h-11 items-center px-2 font-medium text-ink-900">Calendar</span>
            <Link to="/admin/schedule" className="flex min-h-11 items-center px-2 hover:text-ink-900">
              Schedule
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBookingDraftStart(defaultBookingStartForViewedDay())}
            className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
          >
            New appointment
          </button>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            className="flex min-h-11 items-center px-2 text-sm text-ink-700 hover:text-ink-900"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex h-14 shrink-0 items-center gap-0.5 border-b border-hairline px-4 sm:px-6">
        {/* min-h/w-11 = 44px minimum touch target (CLAUDE.md §24). */}
        <button
          type="button"
          onClick={() => setAnchorDate((date) => addPeriod('day', date, -1))}
          aria-label="Previous day"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setAnchorDate((date) => addPeriod('day', date, 1))}
          aria-label="Next day"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
        >
          ›
        </button>
        {!isSameLocalDay(anchorDate, now) && (
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            className="flex min-h-11 items-center rounded-pill border border-hairline px-3 text-xs font-medium text-ink-700 hover:text-ink-900"
          >
            Today
          </button>
        )}
        <span className="ml-1 text-sm text-ink-700">
          {anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex">
            <div className="w-14 shrink-0 pr-2 text-right sm:w-16 sm:pr-3">
              {HOUR_LABELS.map((label) => (
                <div key={label} className="font-mono text-xs tabular-nums text-ink-700" style={{ height: HOUR_ROW_HEIGHT }}>
                  <span className="block pt-1">{label}</span>
                </div>
              ))}
            </div>
            <div
              className="relative flex-1 cursor-pointer border-l border-hairline"
              onClick={handleRailClick}
              role="button"
              tabIndex={-1}
              aria-label="Tap a time to create an appointment"
            >
              <div>
                {HOUR_LABELS.map((label) => (
                  <div key={label} className="border-t border-hairline first:border-t-0" style={{ height: HOUR_ROW_HEIGHT }} />
                ))}
              </div>
              {blockedSlots.map((block) => {
                const clipped = clipRangeToDay(new Date(block.startAt), new Date(block.endAt), range.start, range.end)
                if (!clipped) return null
                return <BlockedRange key={block.id} label={block.label} startAt={clipped.start} endAt={clipped.end} />
              })}
              {appointments.map((appointment) => {
                const clipped = clipRangeToDay(new Date(appointment.startAt), new Date(appointment.endAt), range.start, range.end)
                if (!clipped) return null
                return (
                  <AppointmentTag
                    key={appointment.id}
                    startAt={clipped.start}
                    endAt={clipped.end}
                    status={appointment.status}
                    title={appointment.purpose}
                    attendee={`${appointment.name} · ${appointment.email}`}
                    source={appointment.source}
                    onClick={() => setSelectedAppointment(appointment)}
                  />
                )
              })}
              {isSameLocalDay(anchorDate, now) && <NowIndicator now={now} />}
            </div>
          </div>
        </div>
      </div>

      {selectedAppointment && (
        <AdminAppointmentPanel appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} />
      )}
      {bookingDraftStart && (
        <AdminBookingPanel initialStart={bookingDraftStart} onClose={() => setBookingDraftStart(null)} />
      )}
    </div>
  )
}
