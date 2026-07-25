import type { CanvasZoom } from '@/features/calendar/components/TimeCanvas'

const DAY_MONTH_FORMAT = { month: 'short', day: 'numeric' } as const

function startOfWeekMonday(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay() // 0 = Sun .. 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diffToMonday)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Display-only date formatting for the header's context label. Day/Week/
 * Month are zoom levels of one time system (CLAUDE.md §7), so the header
 * reflects whichever range the current zoom level represents. This is pure
 * presentation — not the availability/booking date logic that ships in
 * later phases.
 */
export function getDateContextLabel(zoom: CanvasZoom, referenceDate: Date): string {
  if (zoom === 'day') {
    return referenceDate.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  if (zoom === 'week') {
    const start = startOfWeekMonday(referenceDate)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return `Week of ${start.toLocaleDateString(undefined, DAY_MONTH_FORMAT)} – ${end.toLocaleDateString(undefined, DAY_MONTH_FORMAT)}`
  }

  return referenceDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export interface MonthGridCell {
  date: Date
  inCurrentMonth: boolean
}

/** A standard 6x7 (42-cell) month grid, Monday-first, including the leading/trailing days of adjacent months. */
export function getMonthGridCells(referenceDate: Date): MonthGridCell[] {
  const firstOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
  const gridStart = startOfWeekMonday(firstOfMonth)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return { date, inCurrentMonth: date.getMonth() === referenceDate.getMonth() }
  })
}
