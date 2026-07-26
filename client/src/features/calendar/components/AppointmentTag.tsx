import type { CSSProperties } from 'react'
import { formatClockFromDate, heightForRange, offsetForDate } from '@/features/calendar/lib/layout'

export type AppointmentTagStatus = 'pending' | 'confirmed' | 'cancelled'
export type AppointmentTagSource = 'ai' | 'admin' | 'public'

const SOURCE_LABEL: Record<AppointmentTagSource, string> = {
  ai: 'via AI',
  admin: 'via Admin',
  public: 'via Web',
}

interface AppointmentTagProps {
  startAt: Date
  endAt: Date
  status: AppointmentTagStatus
  /** Only present in an authenticated admin context (Phase 9) — the public view never
   * receives name/email/purpose, so this renders a generic "Booked" label without it. */
  title?: string
  attendee?: string
  source?: AppointmentTagSource
  /** Week view renders a narrower column and drops the attendee line. */
  compact?: boolean
}

/**
 * The appointment "tag" — mono time range, title, truncated attendee, a
 * source indicator, and a status left-edge bar (CLAUDE.md §8). Positioned
 * absolutely within a relative hour-rail ancestor.
 */
export function AppointmentTag({ startAt, endAt, status, title, attendee, source, compact = false }: AppointmentTagProps) {
  const cancelled = status === 'cancelled'
  const startLabel = formatClockFromDate(startAt)
  const endLabel = formatClockFromDate(endAt)
  const displayTitle = title ?? 'Booked'

  const style: CSSProperties = {
    top: offsetForDate(startAt),
    height: Math.max(heightForRange(startAt, endAt), 40),
  }

  const metaLine = [attendee, source ? SOURCE_LABEL[source] : undefined].filter(Boolean).join(' · ')

  return (
    <div
      style={style}
      role="group"
      aria-label={`${displayTitle}, ${startLabel} to ${endLabel}${cancelled ? ', cancelled' : ''}`}
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
        {displayTitle}
      </p>
      {metaLine && <p className="truncate text-xs text-ink-700">{metaLine}</p>}
    </div>
  )
}
