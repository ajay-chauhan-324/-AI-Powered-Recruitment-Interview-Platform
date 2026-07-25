import type { CSSProperties } from 'react'
import { formatClock, minutesToOffset } from '@/features/calendar/lib/layout'

/**
 * The current-time line for Day view. Uses the real current time (a
 * display concern, not booking/availability logic) — this is the one piece
 * of "live" data in the Phase 1 foundation. The badge carries an explicit
 * label so the indicator never relies on the amber line color alone.
 */
export function NowIndicator({ now }: { now: Date }) {
  const style: CSSProperties = { top: minutesToOffset(now.getHours(), now.getMinutes()) }
  const label = formatClock(now.getHours(), now.getMinutes())

  return (
    <div style={style} className="absolute inset-x-0 z-10 flex items-center">
      <span className="absolute left-1.5 -translate-x-1/2 rounded-pill border border-amber-600 bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-ink-900 sm:left-2">
        Now · {label}
      </span>
      <span className="h-px w-full bg-amber-600" aria-hidden="true" />
    </div>
  )
}
