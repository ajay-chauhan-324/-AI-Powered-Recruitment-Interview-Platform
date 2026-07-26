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

export interface DateRange {
  start: Date
  end: Date
}

/** All range/day-arithmetic below uses local (browser) time deliberately — the calendar
 * shows times in the viewer's own timezone, same as virtually every calendar UI; the
 * business's configured timezone only matters for backend availability computation. */

export function getDayRange(date: Date): DateRange {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export function getWeekRange(date: Date): DateRange {
  const start = startOfWeekMonday(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

/** The date range spanning the full 42-cell month grid (including adjacent-month lead/trail days). */
export function getMonthGridRange(date: Date): DateRange {
  const cells = getMonthGridCells(date)
  const start = cells[0].date
  const end = new Date(cells[41].date)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export function getRangeForZoom(zoom: CanvasZoom, date: Date): DateRange {
  if (zoom === 'day') return getDayRange(date)
  if (zoom === 'week') return getWeekRange(date)
  return getMonthGridRange(date)
}

/** Moves the anchor date by one zoom-appropriate step (a day, a week, or a month). */
export function addPeriod(zoom: CanvasZoom, date: Date, direction: 1 | -1): Date {
  const result = new Date(date)
  if (zoom === 'day') result.setDate(result.getDate() + direction)
  else if (zoom === 'week') result.setDate(result.getDate() + direction * 7)
  else result.setMonth(result.getMonth() + direction)
  return result
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
