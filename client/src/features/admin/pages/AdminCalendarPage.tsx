import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminInterviews, fetchAdminBlockedSlots, type AdminInterview } from '@/features/admin/api/adminApi'
import { AdminNav } from '@/features/admin/components/AdminNav'
import { AdminInterviewPanel } from '@/features/admin/components/AdminInterviewPanel'
import { AdminNewInterviewPanel } from '@/features/admin/components/AdminNewInterviewPanel'
import { BlockedRange } from '@/features/calendar/components/BlockedRange'
import { InterviewTag } from '@/features/calendar/components/InterviewTag'
import { NowIndicator } from '@/features/calendar/components/NowIndicator'
import { getDayRange, addPeriod, isSameLocalDay } from '@/lib/dateContext'
import { HOUR_ROW_HEIGHT, clipRangeToDay, minutesToOffset, offsetForDate, offsetToTimeOfDay } from '@/features/calendar/lib/layout'
import { computeDefaultBookingStart } from '@/features/booking/constants'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
})

// Without this, the admin canvas opens scrolled to midnight instead of near the current
// time / working hours.
const DEFAULT_SCROLL_HOUR = 7

/**
 * Admin-only interview calendar: full detail, all statuses (including cancelled, for
 * historical visibility), create/reschedule/cancel. A single Day view covers create/
 * reschedule/resize/cancel/create-blocked-time without the added surface area of porting
 * the whole zoom-level system into an authenticated context.
 */
export function AdminCalendarPage() {
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedInterview, setSelectedInterview] = useState<AdminInterview | null>(null)
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

  // The keyboard-accessible "New interview" button's default time should reflect the day
  // being viewed, not always "now" — an admin who's navigated to next week and hits this
  // button expects a draft on the day they're looking at, same as clicking the rail would give.
  function defaultBookingStartForViewedDay(): Date {
    if (isSameLocalDay(anchorDate, now)) return computeDefaultBookingStart(now)
    const start = new Date(anchorDate)
    start.setHours(9, 0, 0, 0)
    return start
  }

  const interviewsQuery = useQuery({
    queryKey: ['admin-interviews', range.start.toISOString(), range.end.toISOString()],
    queryFn: () => fetchAdminInterviews(range.start, range.end),
  })
  const blockedSlotsQuery = useQuery({
    queryKey: ['admin-blocked-slots', range.start.toISOString(), range.end.toISOString()],
    queryFn: () => fetchAdminBlockedSlots(range.start, range.end),
  })
  useRealtimeInvalidation([['admin-interviews'], ['admin-blocked-slots']])

  function handleRailClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const { hour, minute } = offsetToTimeOfDay(event.clientY - rect.top)
    const clicked = new Date(range.start)
    clicked.setHours(hour, minute, 0, 0)
    setBookingDraftStart(clicked)
  }

  const interviews = interviewsQuery.data?.interviews ?? []
  const blockedSlots = blockedSlotsQuery.data?.blockedSlots ?? []
  const isLoading = interviewsQuery.isLoading || blockedSlotsQuery.isLoading
  const isError = interviewsQuery.isError || blockedSlotsQuery.isError

  return (
    <div className="flex h-dvh flex-col bg-paper-50">
      <AdminNav />

      <div className="flex h-14 shrink-0 items-center gap-0.5 border-b border-hairline px-4 sm:px-6">
        {/* min-h/w-11 = 44px minimum touch target. */}
        <button
          type="button"
          onClick={() => setAnchorDate((date) => addPeriod(date, -1))}
          aria-label="Previous day"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setAnchorDate((date) => addPeriod(date, 1))}
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
        <span className="ml-1 flex-1 text-sm text-ink-700">
          {anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <button
          type="button"
          onClick={() => setBookingDraftStart(defaultBookingStartForViewedDay())}
          className="flex min-h-11 shrink-0 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
        >
          New interview
        </button>
      </div>

      {isError && (
        <p role="alert" className="shrink-0 border-b border-hairline bg-conflict-tint px-4 py-2 text-sm text-conflict sm:px-6">
          Couldn't load today's schedule. Please try again.
        </p>
      )}
      {isLoading && (
        <p className="shrink-0 border-b border-hairline px-4 py-2 text-sm text-ink-700 sm:px-6">Loading schedule…</p>
      )}

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
            {/* Mouse-only precision time-picking — deliberately no button/keyboard semantics
                here (a div can't meaningfully expose "which time" via keyboard navigation
                anyway). The real keyboard-accessible path to the same feature is the "New
                interview" button above (CLAUDE.md's "admin drag actions must have keyboard
                alternatives" rule), which opens the same panel with a sensible default time. */}
            <div className="relative flex-1 cursor-pointer border-l border-hairline" onClick={handleRailClick}>
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
              {interviews.map((interview) => {
                const clipped = clipRangeToDay(new Date(interview.startAt), new Date(interview.endAt), range.start, range.end)
                if (!clipped) return null
                return (
                  <InterviewTag
                    key={interview.id}
                    startAt={clipped.start}
                    endAt={clipped.end}
                    status={interview.status}
                    title={interview.title}
                    attendee={interview.candidateName}
                    interviewType={interview.interviewType}
                    round={interview.round}
                    source={interview.source}
                    onClick={() => setSelectedInterview(interview)}
                  />
                )
              })}
              {isSameLocalDay(anchorDate, now) && <NowIndicator now={now} />}
            </div>
          </div>
        </div>
      </div>

      {selectedInterview && (
        <AdminInterviewPanel interview={selectedInterview} onClose={() => setSelectedInterview(null)} />
      )}
      {bookingDraftStart && (
        <AdminNewInterviewPanel initialStart={bookingDraftStart} onClose={() => setBookingDraftStart(null)} />
      )}
    </div>
  )
}
