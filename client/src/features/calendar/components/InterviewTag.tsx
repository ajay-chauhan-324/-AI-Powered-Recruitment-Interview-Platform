import type { CSSProperties } from 'react'
import { formatClockFromDate, heightForRange, offsetForDate } from '@/features/calendar/lib/layout'

export type InterviewTagStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
export type InterviewTagSource = 'ai' | 'admin' | 'public'
export type InterviewTagType =
  | 'hr_screening'
  | 'technical'
  | 'coding'
  | 'system_design'
  | 'behavioral'
  | 'managerial'
  | 'final'
  | 'panel'
  | 'custom'

const SOURCE_LABEL: Record<InterviewTagSource, string> = {
  ai: 'via AI',
  admin: 'via Admin',
  public: 'via Web',
}

/** Short labels — these sit on a compact calendar tag, not a full sentence. */
const INTERVIEW_TYPE_LABEL: Record<InterviewTagType, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical',
  coding: 'Coding',
  system_design: 'System Design',
  behavioral: 'Behavioral',
  managerial: 'Managerial',
  final: 'Final',
  panel: 'Panel',
  custom: 'Interview',
}

interface InterviewTagProps {
  startAt: Date
  endAt: Date
  status: InterviewTagStatus
  /** Only present in an authenticated admin context — the public view never receives
   * candidate/interview detail, so this renders a generic "Interview" label without it. */
  title?: string
  attendee?: string
  interviewType?: InterviewTagType
  round?: number
  source?: InterviewTagSource
  /** Week view renders a narrower column and drops the attendee line. */
  compact?: boolean
  /** Briefly true right after a real-time update affecting this interview. */
  highlighted?: boolean
  /** Admin-only: opens the edit panel. Undefined (the public view's default) renders a
   * non-interactive tag — the public canvas is read-only except for tapping empty slots. */
  onClick?: () => void
}

/**
 * The interview "tag" — mono time range, title, interview type/round, truncated
 * candidate name, a source indicator, and a status left-edge bar. Positioned absolutely
 * within a relative hour-rail ancestor.
 */
export function InterviewTag({
  startAt,
  endAt,
  status,
  title,
  attendee,
  interviewType,
  round,
  source,
  compact = false,
  highlighted = false,
  onClick,
}: InterviewTagProps) {
  const cancelled = status === 'cancelled'
  // Distinct from "cancelled" — the interview actually happened (or the candidate no-showed),
  // so it must never get the cancelled state's strikethrough, only the same muted/no-longer-
  // live border treatment (it's not an upcoming/active tag either).
  const concluded = status === 'completed' || status === 'no_show'
  const startLabel = formatClockFromDate(startAt)
  const endLabel = formatClockFromDate(endAt)
  const displayTitle = title ?? 'Interview'
  const typeLabel = interviewType ? INTERVIEW_TYPE_LABEL[interviewType] : undefined

  const style: CSSProperties = {
    top: offsetForDate(startAt),
    // 44px minimum when interactive (admin); the public view's read-only tags don't need a
    // touch-target minimum, so they can stay slightly more compact.
    height: Math.max(heightForRange(startAt, endAt), onClick ? 44 : 40),
  }

  const typeAndRound = typeLabel ? `${typeLabel}${round && round > 1 ? ` · Round ${round}` : ''}` : undefined
  const metaLine = [attendee, typeAndRound, source ? SOURCE_LABEL[source] : undefined].filter(Boolean).join(' · ')

  return (
    <div
      style={style}
      role={onClick ? 'button' : 'group'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${displayTitle}, ${startLabel} to ${endLabel}${cancelled ? ', cancelled' : status === 'completed' ? ', completed' : status === 'no_show' ? ', no-show' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={
        'absolute overflow-hidden rounded-md border-l-[3px] bg-paper-50 px-2.5 py-1.5 shadow-tag ' +
        (compact ? 'inset-x-1' : 'left-2 right-2 sm:right-auto sm:w-[min(60%,26rem)]') +
        ' ' +
        (cancelled || concluded ? 'border-ink-300' : 'border-amber-600') +
        (highlighted ? ' pulse-highlight' : '') +
        (onClick ? ' cursor-pointer' : '')
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
