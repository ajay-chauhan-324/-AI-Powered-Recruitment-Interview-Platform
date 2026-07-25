import type { CSSProperties } from 'react'
import type { DemoBlock } from '@/features/calendar/fixtures/demoCalendarData'
import { minutesToOffset } from '@/features/calendar/lib/layout'

/**
 * Blocked time: a 45-degree hatch pattern spanning the full affected range,
 * with a label at the block's start edge (CLAUDE.md §10). Never a booking
 * target — presentational only in Phase 1.
 */
export function BlockedRange({ block }: { block: DemoBlock }) {
  const top = minutesToOffset(block.startHour, block.startMinute)
  const bottom = minutesToOffset(block.endHour, block.endMinute)

  const style: CSSProperties = {
    top,
    height: bottom - top,
    backgroundImage:
      'repeating-linear-gradient(45deg, var(--color-ink-300) 0, var(--color-ink-300) 2px, transparent 2px, transparent 10px)',
  }

  return (
    <div style={style} className="absolute inset-x-0 border-y border-hairline bg-paper-200" role="presentation">
      <span className="absolute left-2 top-1 text-xs text-ink-700 sm:left-3">{block.label}</span>
    </div>
  )
}
