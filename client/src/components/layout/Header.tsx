import { useMemo } from 'react'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { addPeriod, getDateContextLabel, isSameLocalDay } from '@/lib/dateContext'
import type { CanvasZoom } from '@/features/calendar/components/TimeCanvas'

const ZOOM_OPTIONS: ReadonlyArray<{ value: CanvasZoom; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const ZOOM_UNIT_LABEL: Record<CanvasZoom, string> = { day: 'day', week: 'week', month: 'month' }

interface HeaderProps {
  zoom: CanvasZoom
  onZoomChange: (zoom: CanvasZoom) => void
  anchorDate: Date
  onAnchorDateChange: (date: Date) => void
}

/**
 * Minimal contextual header — a thin strip, not a navbar. No primary nav
 * links live here; the only controls are date navigation, context (what
 * date range you're looking at, reflecting the current zoom level per
 * CLAUDE.md §7), and the zoom-level switch itself.
 */
export function Header({ zoom, onZoomChange, anchorDate, onAnchorDateChange }: HeaderProps) {
  const dateLabel = useMemo(() => getDateContextLabel(zoom, anchorDate), [zoom, anchorDate])
  const isToday = useMemo(() => isSameLocalDay(anchorDate, new Date()), [anchorDate])
  const unit = ZOOM_UNIT_LABEL[zoom]

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-paper-50 px-4 sm:h-14 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 font-mono text-sm font-medium tracking-wide text-ink-900">
          The Ledger
        </span>
        <div className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => onAnchorDateChange(addPeriod(zoom, anchorDate, -1))}
            aria-label={`Previous ${unit}`}
            className="rounded-md px-1.5 py-0.5 text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onAnchorDateChange(addPeriod(zoom, anchorDate, 1))}
            aria-label={`Next ${unit}`}
            className="rounded-md px-1.5 py-0.5 text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            ›
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => onAnchorDateChange(new Date())}
              className="ml-1 rounded-pill border border-hairline px-2 py-0.5 text-xs font-medium text-ink-700 hover:text-ink-900"
            >
              Today
            </button>
          )}
        </div>
        <span className="truncate text-sm text-ink-700">{dateLabel}</span>
      </div>
      <SegmentedControl label="Calendar zoom level" options={ZOOM_OPTIONS} value={zoom} onChange={onZoomChange} />
    </header>
  )
}
