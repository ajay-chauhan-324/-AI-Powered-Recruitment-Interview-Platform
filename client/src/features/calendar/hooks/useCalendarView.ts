import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchCalendarView } from '@/features/calendar/api/calendarApi'

export function useCalendarView(range: { start: Date; end: Date }) {
  return useQuery({
    queryKey: ['calendar', range.start.toISOString(), range.end.toISOString()],
    queryFn: () => fetchCalendarView(range.start, range.end),
    placeholderData: keepPreviousData,
  })
}
