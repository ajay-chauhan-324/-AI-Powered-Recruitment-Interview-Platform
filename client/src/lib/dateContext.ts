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

/** Moves the anchor date by one day, in either direction. */
export function addPeriod(date: Date, direction: 1 | -1): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + direction)
  return result
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
