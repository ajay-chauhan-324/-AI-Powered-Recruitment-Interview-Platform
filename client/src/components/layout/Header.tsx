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
  /** The keyboard-operable equivalent of tapping an available slot on the canvas — tapping
   * empty space has no keyboard path, so this button is not optional decoration. */
  onBookNew: () => void
}

/**
 * Minimal contextual header — a thin strip, not a navbar. No primary nav
 * links live here; the only controls are date navigation, context (what
 * date range you're looking at, reflecting the current zoom level per
 * CLAUDE.md §7), and the zoom-level switch itself.
 */
export function Header({ zoom, onZoomChange, anchorDate, onAnchorDateChange, onBookNew }: HeaderProps) {
  const dateLabel = useMemo(() => getDateContextLabel(zoom, anchorDate), [zoom, anchorDate])
  const isToday = useMemo(() => isSameLocalDay(anchorDate, new Date()), [anchorDate])
  const unit = ZOOM_UNIT_LABEL[zoom]

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline bg-paper-50 px-3 sm:h-14 sm:gap-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        {/* Wordmark is dropped below the sm breakpoint (CLAUDE.md §5's mobile layout omits
            it entirely — date navigation and the zoom control are what earn the space). */}
        <span className="hidden shrink-0 font-mono text-sm font-medium tracking-wide text-ink-900 sm:inline">
          The Ledger
          <span className="hidden font-sans font-normal text-ink-500 lg:inline"> · Interview Scheduling</span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* min-h/w-11 = 44px minimum touch target (CLAUDE.md §24) even though the visible
              glyph/pill is smaller — the header's own height (56px at this breakpoint) has
              room for it without changing the compact visual design. */}
          <button
            type="button"
            onClick={() => onAnchorDateChange(addPeriod(zoom, anchorDate, -1))}
            aria-label={`Previous ${unit}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onAnchorDateChange(addPeriod(zoom, anchorDate, 1))}
            aria-label={`Next ${unit}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            ›
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => onAnchorDateChange(new Date())}
              className="hidden min-h-11 items-center rounded-pill border border-hairline px-3 text-xs font-medium text-ink-700 hover:text-ink-900 sm:flex"
            >
              Today
            </button>
          )}
        </div>
        <span className="min-w-0 truncate text-sm text-ink-700">{dateLabel}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Also dropped on mobile per CLAUDE.md §5 — the AI ribbon and tapping an available
            slot are the mobile booking entry points; this button returns at the sm breakpoint. */}
        <button
          type="button"
          onClick={onBookNew}
          className="hidden min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 text-sm font-medium text-ink-900 hover:bg-amber-100/70 sm:flex"
        >
          Book
        </button>
        <SegmentedControl label="Calendar zoom level" options={ZOOM_OPTIONS} value={zoom} onChange={onZoomChange} />
      </div>
    </header>
  )
}
