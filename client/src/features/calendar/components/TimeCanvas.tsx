import { useEffect, useMemo, useRef } from 'react'
import type { TouchEvent } from 'react'
import { getMonthGridCells, getRangeForZoom, isSameLocalDay, type DateRange } from '@/lib/dateContext'
import { HOUR_ROW_HEIGHT, clipRangeToDay, minutesToOffset, offsetForDate, weekdayIndexMondayFirst } from '@/features/calendar/lib/layout'
import { useCalendarView } from '@/features/calendar/hooks/useCalendarView'
import { useCalendarRealtime } from '@/features/calendar/hooks/useCalendarRealtime'
import type { CalendarAppointment, CalendarBlock } from '@/features/calendar/api/calendarApi'
import { AppointmentTag } from './AppointmentTag'
import { BlockedRange } from './BlockedRange'
import { NowIndicator } from './NowIndicator'

export type CanvasZoom = 'day' | 'week' | 'month'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
})

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Both Day and Week are tall 24-hour columns — scroll to a sensible working-hours
 * start on load instead of defaulting to midnight, so real appointments (and, on
 * Day view, the current-time line) are visible without the viewer scrolling first. */
const DEFAULT_SCROLL_HOUR = 7
const SWIPE_THRESHOLD_PX = 50

// A stable reference (not a fresh `[]` literal per render) so hooks that depend on
// "the appointments array" don't invalidate their memoization every render while loading.
const EMPTY_APPOINTMENTS: CalendarAppointment[] = []

interface TimeCanvasProps {
  zoom: CanvasZoom
  anchorDate: Date
  onAnchorDateChange: (date: Date) => void
  onZoomChange: (zoom: CanvasZoom) => void
}

/**
 * The Time Canvas, wired to the real backend (Phase 2-4). Appointments and
 * blocked time are the PUBLIC-safe read model (server/src/services/
 * calendarView.service.ts) — no name/email/purpose, since no authentication
 * exists yet (Phase 9 adds an authenticated admin variant with full detail).
 *
 * "Conflict states" (CLAUDE.md §5 Phase 5 scope) has no trigger yet — there
 * is no interactive booking or drag-to-reschedule until Phase 8/9, so
 * there's nothing to conflict with. The visual language (border-conflict,
 * conflict-tint) is ready in the design tokens for those phases to use.
 */
export function TimeCanvas({ zoom, anchorDate, onAnchorDateChange, onZoomChange }: TimeCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useMemo(() => new Date(), [])
  const range = useMemo(() => getRangeForZoom(zoom, anchorDate), [zoom, anchorDate])
  const { data, isLoading, isError } = useCalendarView(range)
  const { recentlyChangedIds } = useCalendarRealtime()

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return

    if (zoom === 'month') {
      node.scrollTop = 0
      return
    }

    const defaultTarget = minutesToOffset(DEFAULT_SCROLL_HOUR, 0)
    const nowTarget =
      zoom === 'day' && isSameLocalDay(anchorDate, now) ? offsetForDate(now) - 120 : defaultTarget
    node.scrollTop = Math.max(0, Math.min(defaultTarget, nowTarget))
  }, [zoom, anchorDate, now])

  const touchStartX = useRef<number | null>(null)

  function handleTouchStart(event: TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(event: TouchEvent) {
    const startX = touchStartX.current
    touchStartX.current = null
    if (startX === null) return

    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return

    const direction = deltaX < 0 ? 1 : -1
    const result = new Date(anchorDate)
    if (zoom === 'day') result.setDate(result.getDate() + direction)
    else if (zoom === 'week') result.setDate(result.getDate() + direction * 7)
    else result.setMonth(result.getMonth() + direction)
    onAnchorDateChange(result)
  }

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={`${zoom} time canvas`}
      className="h-full overflow-y-auto pb-36"
      tabIndex={0}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {isError && (
        <p className="mx-auto max-w-5xl px-4 pt-3 text-xs text-conflict sm:px-6">
          Something went wrong loading the calendar — retry by switching views or reloading.
        </p>
      )}
      {isLoading && !data && (
        <p className="mx-auto max-w-5xl px-4 pt-3 text-xs text-ink-700 sm:px-6">Loading…</p>
      )}
      {zoom === 'day' && (
        <DayFoundation
          range={range}
          data={data}
          now={now}
          isSameAsToday={isSameLocalDay(anchorDate, now)}
          recentlyChangedIds={recentlyChangedIds}
        />
      )}
      {zoom === 'week' && <WeekFoundation range={range} data={data} recentlyChangedIds={recentlyChangedIds} />}
      {zoom === 'month' && (
        <MonthFoundation
          anchorDate={anchorDate}
          data={data}
          onSelectDay={(date) => {
            onAnchorDateChange(date)
            onZoomChange('day')
          }}
        />
      )}
    </div>
  )
}

function HourGridLines() {
  return (
    <div>
      {HOUR_LABELS.map((label) => (
        <div key={label} className="border-t border-hairline first:border-t-0" style={{ height: HOUR_ROW_HEIGHT }} />
      ))}
    </div>
  )
}

interface ViewData {
  appointments: CalendarAppointment[]
  blockedSlots: CalendarBlock[]
}

function DayFoundation({
  range,
  data,
  now,
  isSameAsToday,
  recentlyChangedIds,
}: {
  range: DateRange
  data: ViewData | undefined
  now: Date
  isSameAsToday: boolean
  recentlyChangedIds: ReadonlySet<string>
}) {
  const appointments = data?.appointments ?? []
  const blockedSlots = data?.blockedSlots ?? []
  const isEmpty = data && appointments.length === 0 && blockedSlots.length === 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
      {isEmpty && (
        <p className="pointer-events-none sticky top-1/2 z-10 mx-auto max-w-xs -translate-y-1/2 text-center text-sm text-ink-700">
          Nothing scheduled for this day.
        </p>
      )}
      <div className="flex">
        <div className="w-14 shrink-0 pr-2 text-right sm:w-16 sm:pr-3">
          {HOUR_LABELS.map((label) => (
            <div key={label} className="font-mono text-xs tabular-nums text-ink-700" style={{ height: HOUR_ROW_HEIGHT }}>
              <span className="block pt-1">{label}</span>
            </div>
          ))}
        </div>
        <div className="relative flex-1 border-l border-hairline">
          <HourGridLines />
          {blockedSlots.map((block) => {
            const clipped = clipRangeToDay(new Date(block.startAt), new Date(block.endAt), range.start, range.end)
            if (!clipped) return null
            return <BlockedRange key={block.id} label={block.label} startAt={clipped.start} endAt={clipped.end} />
          })}
          {appointments.map((appointment) => {
            const clipped = clipRangeToDay(
              new Date(appointment.startAt),
              new Date(appointment.endAt),
              range.start,
              range.end,
            )
            if (!clipped) return null
            return (
              <AppointmentTag
                key={appointment.id}
                startAt={clipped.start}
                endAt={clipped.end}
                status={appointment.status}
                highlighted={recentlyChangedIds.has(appointment.id)}
              />
            )
          })}
          {isSameAsToday && <NowIndicator now={now} />}
        </div>
      </div>
    </div>
  )
}

function WeekFoundation({
  range,
  data,
  recentlyChangedIds,
}: {
  range: DateRange
  data: ViewData | undefined
  recentlyChangedIds: ReadonlySet<string>
}) {
  const appointments = data?.appointments ?? []
  const blockedSlots = data?.blockedSlots ?? []

  const dayBounds = Array.from({ length: 7 }, (_, dayIndex) => {
    const start = new Date(range.start)
    start.setDate(start.getDate() + dayIndex)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  })

  return (
    <div className="mx-auto flex w-full flex-col px-4 py-4 sm:px-6">
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-hairline pb-2 sm:grid-cols-[4rem_repeat(7,1fr)]">
        <span aria-hidden="true" />
        {WEEKDAY_LABELS.map((day) => (
          <span key={day} className="text-center text-xs font-medium uppercase tracking-wide text-ink-700">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] sm:grid-cols-[4rem_repeat(7,1fr)]">
        <div className="pr-2 text-right sm:pr-3">
          {HOUR_LABELS.map((label, index) => (
            <div
              key={label}
              className="border-t border-hairline first:border-t-0 font-mono text-xs tabular-nums text-ink-700"
              style={{ height: HOUR_ROW_HEIGHT }}
            >
              {index % 2 === 0 && <span className="block pt-1">{label}</span>}
            </div>
          ))}
        </div>
        {dayBounds.map((bounds, dayIndex) => (
          <div key={dayIndex} className="relative border-l border-hairline">
            <HourGridLines />
            {blockedSlots
              .filter((block) => weekdayIndexMondayFirst(new Date(block.startAt)) === dayIndex || weekdayIndexMondayFirst(new Date(block.endAt)) === dayIndex)
              .map((block) => {
                const clipped = clipRangeToDay(new Date(block.startAt), new Date(block.endAt), bounds.start, bounds.end)
                if (!clipped) return null
                return <BlockedRange key={block.id} label={block.label} startAt={clipped.start} endAt={clipped.end} />
              })}
            {appointments
              .filter((appointment) => weekdayIndexMondayFirst(new Date(appointment.startAt)) === dayIndex)
              .map((appointment) => {
                const clipped = clipRangeToDay(
                  new Date(appointment.startAt),
                  new Date(appointment.endAt),
                  bounds.start,
                  bounds.end,
                )
                if (!clipped) return null
                return (
                  <AppointmentTag
                    key={appointment.id}
                    startAt={clipped.start}
                    endAt={clipped.end}
                    status={appointment.status}
                    compact
                    highlighted={recentlyChangedIds.has(appointment.id)}
                  />
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthFoundation({
  anchorDate,
  data,
  onSelectDay,
}: {
  anchorDate: Date
  data: ViewData | undefined
  onSelectDay: (date: Date) => void
}) {
  const cells = useMemo(() => getMonthGridCells(anchorDate), [anchorDate])
  const appointments = data?.appointments ?? EMPTY_APPOINTMENTS

  const countsByDateKey = useMemo(() => {
    const counts = new Map<string, number>()
    for (const appointment of appointments) {
      const date = new Date(appointment.startAt)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [appointments])

  return (
    <div className="mx-auto w-full px-4 py-4 sm:px-6">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-hairline bg-paper-200">
        {WEEKDAY_LABELS.map((day) => (
          <div key={day} className="bg-paper-100 py-1 text-center text-xs font-medium uppercase tracking-wide text-ink-700">
            {day}
          </div>
        ))}
        {cells.map(({ date, inCurrentMonth }, index) => {
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
          const count = countsByDateKey.get(key) ?? 0
          const tickCount = Math.min(count, 3)
          const overflow = count > 3 ? count - 3 : 0
          const cellLabel = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectDay(date)}
              aria-label={
                count > 0
                  ? `${cellLabel}, ${count} appointment${count === 1 ? '' : 's'}. View day.`
                  : `${cellLabel}. View day.`
              }
              className={
                'flex min-h-20 flex-col gap-1 p-1.5 text-left hover:bg-amber-100/40 focus-visible:relative focus-visible:z-10 sm:min-h-28 sm:p-2 ' +
                (inCurrentMonth ? 'bg-paper-50' : 'bg-paper-50/50')
              }
            >
              <span className={'font-mono text-xs tabular-nums ' + (inCurrentMonth ? 'text-ink-900' : 'text-ink-300')}>
                {date.getDate()}
              </span>
              {count > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {Array.from({ length: tickCount }).map((_, tickIndex) => (
                    <span key={tickIndex} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink-900" />
                  ))}
                  {overflow > 0 && <span className="text-xs text-ink-700">+{overflow} more</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
