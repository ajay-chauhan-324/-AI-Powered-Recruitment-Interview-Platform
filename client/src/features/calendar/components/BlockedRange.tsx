import type { CSSProperties } from 'react'
import { heightForRange, offsetForDate } from '@/features/calendar/lib/layout'

interface BlockedRangeProps {
  label: string
  startAt: Date
  endAt: Date
}

/**
 * Blocked time: a 45-degree hatch pattern spanning the full affected range,
 * with a label at the block's start edge (CLAUDE.md §10). Never a booking
 * target for public users.
 */
export function BlockedRange({ label, startAt, endAt }: BlockedRangeProps) {
  const style: CSSProperties = {
    top: offsetForDate(startAt),
    height: heightForRange(startAt, endAt),
    backgroundImage:
      'repeating-linear-gradient(45deg, var(--color-ink-300) 0, var(--color-ink-300) 2px, transparent 2px, transparent 10px)',
  }

  return (
    <div style={style} className="absolute inset-x-0 border-y border-hairline bg-paper-200" role="presentation">
      <span className="absolute left-2 top-1 text-xs text-ink-700 sm:left-3">{label}</span>
    </div>
  )
}
