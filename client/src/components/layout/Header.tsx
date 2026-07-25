import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { CanvasZoom } from '@/features/calendar/components/TimeCanvas'

const ZOOM_OPTIONS: ReadonlyArray<{ value: CanvasZoom; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

interface HeaderProps {
  zoom: CanvasZoom
  onZoomChange: (zoom: CanvasZoom) => void
  dateLabel: string
}

/**
 * Minimal contextual header — a thin strip, not a navbar. No primary nav
 * links live here; the only controls are context (what date range you're
 * looking at) and the zoom-level switch, since Day/Week/Month are zoom
 * levels of one time system rather than separate destinations.
 */
export function Header({ zoom, onZoomChange, dateLabel }: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-paper-50 px-4 sm:h-14 sm:px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="shrink-0 font-mono text-sm font-medium tracking-wide text-ink-900">
          The Ledger
        </span>
        <span className="hidden truncate text-sm text-ink-700 sm:inline">{dateLabel}</span>
      </div>
      <SegmentedControl label="Calendar zoom level" options={ZOOM_OPTIONS} value={zoom} onChange={onZoomChange} />
    </header>
  )
}
