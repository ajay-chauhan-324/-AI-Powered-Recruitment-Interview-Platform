import type { CSSProperties } from 'react'
import type { DemoAvailabilityTick } from '@/features/calendar/fixtures/demoCalendarData'
import { durationToHeight, minutesToOffset } from '@/features/calendar/lib/layout'

/**
 * Availability stays visually quiet — a thin tick, not a clickable empty
 * cell (CLAUDE.md §9). Text label kept so status never relies on color
 * alone.
 */
export function AvailabilityTick({ tick, showLabel = true }: { tick: DemoAvailabilityTick; showLabel?: boolean }) {
  const style: CSSProperties = {
    top: minutesToOffset(tick.hour, tick.minute),
    height: durationToHeight(tick.durationMinutes),
  }

  return (
    <div style={style} className="absolute left-2 flex items-center gap-2 sm:left-3">
      <span className="h-full w-0.5 shrink-0 rounded-full bg-available" aria-hidden="true" />
      {showLabel && <span className="text-xs text-ink-700">Available</span>}
    </div>
  )
}
