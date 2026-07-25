import { useEffect, useMemo, useRef } from 'react'
import { getMonthGridCells } from '@/lib/dateContext'
import { HOUR_ROW_HEIGHT, minutesToOffset } from '@/features/calendar/lib/layout'
import {
  DEMO_DAY_APPOINTMENTS,
  DEMO_DAY_AVAILABILITY,
  DEMO_DAY_BLOCKS,
  DEMO_MONTH_DENSITY,
  DEMO_WEEK_APPOINTMENTS,
  DEMO_WEEK_AVAILABILITY,
  DEMO_WEEK_BLOCKS,
} from '@/features/calendar/fixtures/demoCalendarData'
import { AppointmentTag } from './AppointmentTag'
import { BlockedRange } from './BlockedRange'
import { AvailabilityTick } from './AvailabilityTick'
import { NowIndicator } from './NowIndicator'

export type CanvasZoom = 'day' | 'week' | 'month'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
})

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Both Day and Week are tall 24-hour columns — scroll to a sensible working-hours
 * start on load instead of defaulting to midnight, so the demo content (and, on
 * Day view, the current-time line) is visible without the reviewer having to
 * scroll first. */
const DEFAULT_SCROLL_HOUR = 7

/**
 * Phase 1 visual foundation. The structural scaffold (hour rail, week
 * columns, month grid) is real; the appointments/availability/blocked-time
 * rendered on it are static DEMO fixtures (see fixtures/demoCalendarData.ts)
 * standing in for real domain data until Phase 2 onward. The current-time
 * line is the one genuinely live element (a display concern, not booking
 * logic).
 */
export function TimeCanvas({ zoom }: { zoom: CanvasZoom }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return

    if (zoom === 'month') {
      node.scrollTop = 0
      return
    }

    const defaultTarget = minutesToOffset(DEFAULT_SCROLL_HOUR, 0)
    // On Day view, also make sure "now" is never scrolled out of view — if it's
    // earlier than the default start, scroll to just above it instead.
    const nowTarget =
      zoom === 'day' ? minutesToOffset(now.getHours(), now.getMinutes()) - 120 : defaultTarget
    node.scrollTop = Math.max(0, Math.min(defaultTarget, nowTarget))
  }, [zoom, now])

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={`${zoom} time canvas (visual foundation with demo data)`}
      className="h-full overflow-y-auto pb-36"
      tabIndex={0}
    >
      <DemoDataNotice />
      {zoom === 'day' && <DayFoundation now={now} />}
      {zoom === 'week' && <WeekFoundation />}
      {zoom === 'month' && <MonthFoundation now={now} />}
    </div>
  )
}

function DemoDataNotice() {
  return (
    <p className="mx-auto max-w-5xl px-4 pt-3 text-xs text-ink-700 sm:px-6">
      Demo data shown for visual review — not real appointments.
    </p>
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

function DayFoundation({ now }: { now: Date }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
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
          {DEMO_DAY_BLOCKS.map((block) => (
            <BlockedRange key={block.id} block={block} />
          ))}
          {DEMO_DAY_AVAILABILITY.map((tick) => (
            <AvailabilityTick key={tick.id} tick={tick} />
          ))}
          {DEMO_DAY_APPOINTMENTS.map((appointment) => (
            <AppointmentTag key={appointment.id} appointment={appointment} />
          ))}
          <NowIndicator now={now} />
        </div>
      </div>
    </div>
  )
}

function WeekFoundation() {
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
        {WEEKDAY_LABELS.map((_, dayIndex) => (
          <div key={dayIndex} className="relative border-l border-hairline">
            <HourGridLines />
            {DEMO_WEEK_BLOCKS.filter((block) => block.dayIndex === dayIndex).map((block) => (
              <BlockedRange key={block.id} block={block} />
            ))}
            {DEMO_WEEK_AVAILABILITY.filter((tick) => tick.dayIndex === dayIndex).map((tick) => (
              <AvailabilityTick key={tick.id} tick={tick} showLabel={false} />
            ))}
            {DEMO_WEEK_APPOINTMENTS.filter((appointment) => appointment.dayIndex === dayIndex).map((appointment) => (
              <AppointmentTag key={appointment.id} appointment={appointment} compact />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthFoundation({ now }: { now: Date }) {
  const cells = useMemo(() => getMonthGridCells(now), [now])

  return (
    <div className="mx-auto w-full px-4 py-4 sm:px-6">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-hairline bg-paper-200">
        {WEEKDAY_LABELS.map((day) => (
          <div key={day} className="bg-paper-100 py-1 text-center text-xs font-medium uppercase tracking-wide text-ink-700">
            {day}
          </div>
        ))}
        {cells.map(({ date, inCurrentMonth }, index) => {
          const density = inCurrentMonth
            ? DEMO_MONTH_DENSITY.find((entry) => entry.dayOfMonth === date.getDate())
            : undefined
          const cellLabel = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
          return (
            <div
              key={index}
              role="group"
              aria-label={
                density
                  ? `${cellLabel}, ${density.tickCount} appointment${density.tickCount === 1 ? '' : 's'}${density.overflow ? `, plus ${density.overflow} more` : ''}`
                  : cellLabel
              }
              className={
                'flex min-h-20 flex-col gap-1 p-1.5 sm:min-h-28 sm:p-2 ' +
                (inCurrentMonth ? 'bg-paper-50' : 'bg-paper-50/50')
              }
            >
              <span className={'font-mono text-xs tabular-nums ' + (inCurrentMonth ? 'text-ink-900' : 'text-ink-300')}>
                {date.getDate()}
              </span>
              {density && (
                <div className="flex flex-wrap items-center gap-1">
                  {Array.from({ length: density.tickCount }).map((_, tickIndex) => (
                    <span key={tickIndex} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink-900" />
                  ))}
                  {density.overflow && <span className="text-xs text-ink-700">+{density.overflow} more</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
