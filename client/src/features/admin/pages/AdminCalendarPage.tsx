import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminAppointments, fetchAdminBlockedSlots, adminLogout, type AdminAppointment } from '@/features/admin/api/adminApi'
import { AdminAppointmentPanel } from '@/features/admin/components/AdminAppointmentPanel'
import { AdminBookingPanel } from '@/features/admin/components/AdminBookingPanel'
import { AppointmentTag } from '@/features/calendar/components/AppointmentTag'
import { BlockedRange } from '@/features/calendar/components/BlockedRange'
import { NowIndicator } from '@/features/calendar/components/NowIndicator'
import { getDayRange, addPeriod, isSameLocalDay } from '@/lib/dateContext'
import { HOUR_ROW_HEIGHT, clipRangeToDay, offsetToTimeOfDay } from '@/features/calendar/lib/layout'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
})

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
          <nav className="flex items-center gap-3 text-sm text-ink-700">
            <span className="font-medium text-ink-900">Calendar</span>
            <Link to="/admin/schedule" className="hover:text-ink-900">
              Schedule
            </Link>
          </nav>
        </div>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          className="text-sm text-ink-700 hover:text-ink-900"
        >
          Log out
        </button>
      </header>

      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setAnchorDate((date) => addPeriod('day', date, -1))}
          aria-label="Previous day"
          className="rounded-md px-1.5 py-0.5 text-ink-700 hover:bg-paper-100 hover:text-ink-900"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setAnchorDate((date) => addPeriod('day', date, 1))}
          aria-label="Next day"
          className="rounded-md px-1.5 py-0.5 text-ink-700 hover:bg-paper-100 hover:text-ink-900"
        >
          ›
        </button>
        {!isSameLocalDay(anchorDate, now) && (
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            className="rounded-pill border border-hairline px-2 py-0.5 text-xs font-medium text-ink-700 hover:text-ink-900"
          >
            Today
          </button>
        )}
        <span className="text-sm text-ink-700">
          {anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
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
