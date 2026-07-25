import type { CSSProperties } from 'react'
import type { DemoAppointment } from '@/features/calendar/fixtures/demoCalendarData'
import { durationToHeight, formatClock, minutesToOffset } from '@/features/calendar/lib/layout'

const SOURCE_LABEL: Record<DemoAppointment['source'], string> = {
  ai: 'via AI',
  admin: 'via Admin',
  public: 'via Web',
}

interface AppointmentTagProps {
  appointment: DemoAppointment
  /** Week view renders a narrower column and drops the attendee line. */
  compact?: boolean
}

/**
 * The appointment "tag" — mono time range, title, truncated attendee, a
 * source indicator, and a status left-edge bar (CLAUDE.md §8). Positioned
 * absolutely within a relative hour-rail ancestor.
 */
export function AppointmentTag({ appointment, compact = false }: AppointmentTagProps) {
  const { title, attendee, hour, minute, durationMinutes, source, status } = appointment
  const cancelled = status === 'cancelled'
  const endTotalMinutes = hour * 60 + minute + durationMinutes
  const startLabel = formatClock(hour, minute)
  const endLabel = formatClock(Math.floor(endTotalMinutes / 60) % 24, endTotalMinutes % 60)

  const style: CSSProperties = {
    top: minutesToOffset(hour, minute),
    height: Math.max(durationToHeight(durationMinutes), 40),
  }

  return (
    <div
      style={style}
      role="group"
      aria-label={`${title}, ${startLabel} to ${endLabel}, ${SOURCE_LABEL[source]}${cancelled ? ', cancelled' : ''}`}
      className={
        'absolute overflow-hidden rounded-md border-l-[3px] bg-paper-50 px-2.5 py-1.5 shadow-tag ' +
        (compact ? 'inset-x-1' : 'left-2 right-2 sm:right-auto sm:w-[min(60%,26rem)]') +
        ' ' +
        (cancelled ? 'border-ink-300' : 'border-ink-900')
      }
    >
      <p className="font-mono text-xs tabular-nums text-ink-700">
        {startLabel}–{endLabel}
      </p>
      <p
        className={
          'truncate text-sm font-medium ' +
          (cancelled ? 'text-ink-700 line-through decoration-ink-300 decoration-2' : 'text-ink-900')
        }
      >
        {title}
      </p>
      {!compact && <p className="truncate text-xs text-ink-700">{attendee} · {SOURCE_LABEL[source]}</p>}
      {compact && <p className="truncate text-xs text-ink-700">{SOURCE_LABEL[source]}</p>}
    </div>
  )
}
