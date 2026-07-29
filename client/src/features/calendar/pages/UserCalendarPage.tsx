import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'
import { Button } from '@/components/ui/Button'
import { fetchMyInterviews } from '@/features/interviews/api/myInterviewsApi'
import { InterviewTag } from '@/features/calendar/components/InterviewTag'
import { NowIndicator } from '@/features/calendar/components/NowIndicator'
import { getDayRange, addPeriod, isSameLocalDay } from '@/lib/dateContext'
import { HOUR_ROW_HEIGHT, clipRangeToDay, minutesToOffset, offsetForDate } from '@/features/calendar/lib/layout'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
})

const DEFAULT_SCROLL_HOUR = 7

/**
 * A personal interview calendar, not a booking surface: it answers "what interviews do I
 * already have?", never "what random interview can I book?" (CLAUDE.md's product rule — a
 * candidate only ever gets a time to choose from after a recruiter invites them to interview
 * for a specific job, via the application detail/Interviews-page flow). This shows only this
 * candidate's own interviews, read-only, plus the same public blocked-time context everyone
 * sees for orientation.
 */
export function UserCalendarPage() {
  const navigate = useNavigate()
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const range = useMemo(() => getDayRange(anchorDate), [anchorDate])
  const now = useMemo(() => new Date(), [])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const defaultTarget = minutesToOffset(DEFAULT_SCROLL_HOUR, 0)
    const nowTarget = isSameLocalDay(anchorDate, now) ? offsetForDate(now) - 120 : defaultTarget
    node.scrollTop = Math.max(0, Math.min(defaultTarget, nowTarget))
  }, [anchorDate, now])

  const myInterviewsQuery = useQuery({ queryKey: ['my-interviews'], queryFn: fetchMyInterviews })
  useRealtimeInvalidation([['my-interviews']])

  const myInterviewsToday = (myInterviewsQuery.data?.interviews ?? []).filter((interview) => {
    if (interview.status === 'cancelled') return false
    return clipRangeToDay(new Date(interview.startAt), new Date(interview.endAt), range.start, range.end) !== null
  })
  const myInterviewIds = new Set(myInterviewsToday.map((interview) => interview.id))

  return (
    <AuthenticatedLayout>
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-paper-50 sm:h-[calc(100dvh-3.5rem)]">
        <div className="flex h-14 shrink-0 items-center gap-0.5 border-b border-hairline px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setAnchorDate((date) => addPeriod(date, -1))}
            aria-label="Previous day"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate((date) => addPeriod(date, 1))}
            aria-label="Next day"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          {!isSameLocalDay(anchorDate, now) && (
            <Button variant="secondary" size="sm" onClick={() => setAnchorDate(new Date())}>
              Today
            </Button>
          )}
          <span className="ml-1 flex-1 text-sm text-ink-700">
            {anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
            <div className="flex">
              <div className="w-14 shrink-0 pr-2 text-right sm:w-16 sm:pr-3">
                {HOUR_LABELS.map((label) => (
                  <div key={label} className="font-mono text-xs tabular-nums text-ink-700" style={{ height: HOUR_ROW_HEIGHT }}>
                    <span className="block pt-1">{label}</span>
                  </div>
                ))}
              </div>
              <div className="relative flex-1 border-l border-hairline">
                <div>
                  {HOUR_LABELS.map((label) => (
                    <div key={label} className="border-t border-hairline first:border-t-0" style={{ height: HOUR_ROW_HEIGHT }} />
                  ))}
                </div>
                {myInterviewsToday.map((interview) => {
                  const clipped = clipRangeToDay(new Date(interview.startAt), new Date(interview.endAt), range.start, range.end)
                  if (!clipped) return null
                  return (
                    <InterviewTag
                      key={interview.id}
                      startAt={clipped.start}
                      endAt={clipped.end}
                      status={interview.status}
                      title={interview.title}
                      interviewType={interview.interviewType}
                      round={interview.round}
                      onClick={() => navigate('/interviews')}
                    />
                  )
                })}
                {isSameLocalDay(anchorDate, now) && <NowIndicator now={now} />}
              </div>
            </div>
            {myInterviewsQuery.isLoading && (
              <p className="mt-4 text-center text-sm text-ink-500">Loading your interviews…</p>
            )}
            {myInterviewsQuery.isError && (
              <p role="alert" className="mt-4 text-center text-sm text-conflict">
                Couldn't load your interviews. Please try again.
              </p>
            )}
            {!myInterviewsQuery.isError && myInterviewsToday.length === 0 && !myInterviewsQuery.isLoading && (
              <p className="mt-4 text-center text-sm text-ink-500">
                {myInterviewIds.size === 0 ? 'No interviews of yours today.' : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  )
}
