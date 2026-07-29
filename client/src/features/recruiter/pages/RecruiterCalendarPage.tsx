import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { fetchRecruiterInterviews, type RecruiterInterview } from '@/features/recruiter/api/recruiterApi'
import { RecruiterInterviewPanel } from '@/features/recruiter/components/RecruiterInterviewPanel'
import { InterviewTag, type InterviewTagStatus } from '@/features/calendar/components/InterviewTag'
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

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical',
  coding: 'Coding',
  system_design: 'System Design',
  behavioral: 'Behavioral',
  managerial: 'Managerial',
  final: 'Final',
  panel: 'Panel',
  custom: 'Other',
}

const EMPTY_INTERVIEWS: RecruiterInterview[] = []

function tagStatus(status: RecruiterInterview['status']): InterviewTagStatus {
  return status === 'cancelled' ? 'cancelled' : status === 'pending' ? 'pending' : 'confirmed'
}

/**
 * The recruiter's own scheduled-interview calendar — every interview booked against any of
 * their jobs, across every candidate/application (CLAUDE.md §3: distinct from the candidate's
 * own read-only calendar, which only ever shows that one candidate's interviews). Filterable
 * by job/round-type/candidate and clickable through to a real operational detail panel
 * (RecruiterInterviewPanel) — a real workspace, not just a read-only visual calendar.
 */
export function RecruiterCalendarPage() {
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [jobFilter, setJobFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [candidateSearch, setCandidateSearch] = useState('')
  const [selectedInterview, setSelectedInterview] = useState<RecruiterInterview | null>(null)
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

  const interviewsQuery = useQuery({ queryKey: ['recruiter-interviews'], queryFn: fetchRecruiterInterviews })
  const allInterviews = interviewsQuery.data?.interviews ?? EMPTY_INTERVIEWS
  useRealtimeInvalidation([['recruiter-interviews']])

  const jobOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const interview of allInterviews) map.set(interview.job.id, interview.job.title)
    return Array.from(map.entries())
  }, [allInterviews])

  const typeOptions = useMemo(() => {
    const set = new Set(allInterviews.map((interview) => interview.interviewType))
    return Array.from(set)
  }, [allInterviews])

  const candidateQuery = candidateSearch.trim().toLowerCase()
  const interviewsToday = allInterviews.filter((interview) => {
    if (interview.status === 'cancelled') return false
    if (jobFilter !== 'all' && interview.job.id !== jobFilter) return false
    if (typeFilter !== 'all' && interview.interviewType !== typeFilter) return false
    if (candidateQuery && !interview.candidateName.toLowerCase().includes(candidateQuery)) return false
    return clipRangeToDay(new Date(interview.startAt), new Date(interview.endAt), range.start, range.end) !== null
  })

  const hasAnyInterviews = allInterviews.some((interview) => interview.status !== 'cancelled')
  const hasActiveFilters = jobFilter !== 'all' || typeFilter !== 'all' || candidateQuery.length > 0
  const isEmpty = !interviewsQuery.isLoading && !interviewsQuery.isError && interviewsToday.length === 0

  return (
    <RecruiterLayout>
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-paper-50 sm:h-[calc(100dvh-3.5rem)]">
        <div className="flex flex-col gap-2 border-b border-hairline px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-0.5">
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

          {hasAnyInterviews && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={jobFilter}
                onChange={(event) => setJobFilter(event.target.value)}
                aria-label="Filter by job"
                className="min-h-9 rounded-md border border-hairline bg-paper-50 px-2.5 text-xs text-ink-900 focus-visible:outline-none"
              >
                <option value="all">All jobs</option>
                {jobOptions.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                aria-label="Filter by interview round type"
                className="min-h-9 rounded-md border border-hairline bg-paper-50 px-2.5 text-xs text-ink-900 focus-visible:outline-none"
              >
                <option value="all">All round types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {INTERVIEW_TYPE_LABEL[type] ?? type}
                  </option>
                ))}
              </select>
              <label className="relative flex min-h-9 items-center">
                <Search size={13} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-ink-500" />
                <span className="sr-only">Filter by candidate name</span>
                <input
                  type="search"
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="Candidate name…"
                  className="w-40 rounded-md border border-hairline bg-paper-50 py-1.5 pl-8 pr-2 text-xs text-ink-900 focus-visible:outline-none"
                />
              </label>
            </div>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {interviewsQuery.isError ? (
            <div className="mx-auto max-w-md px-4 py-16">
              <p role="alert" className="text-sm text-conflict">
                Couldn't load your calendar. Please refresh the page to try again.
              </p>
            </div>
          ) : isEmpty ? (
            <div className="mx-auto max-w-md px-4 py-16">
              <EmptyState
                icon={Calendar}
                title={hasActiveFilters ? 'No interviews match these filters.' : 'No interviews scheduled today.'}
                description={
                  hasActiveFilters
                    ? 'Try clearing a filter or picking a different day.'
                    : 'Your calendar is clear. Interviews will appear here as candidates book available slots.'
                }
              />
            </div>
          ) : (
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
                  {interviewsToday.map((interview) => {
                    const clipped = clipRangeToDay(new Date(interview.startAt), new Date(interview.endAt), range.start, range.end)
                    if (!clipped) return null
                    return (
                      <InterviewTag
                        key={interview.id}
                        startAt={clipped.start}
                        endAt={clipped.end}
                        status={tagStatus(interview.status)}
                        title={interview.title}
                        attendee={interview.candidateName}
                        interviewType={interview.interviewType}
                        round={interview.round}
                        onClick={() => setSelectedInterview(interview)}
                      />
                    )
                  })}
                  {isSameLocalDay(anchorDate, now) && <NowIndicator now={now} />}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedInterview && (
        <RecruiterInterviewPanel interview={selectedInterview} onClose={() => setSelectedInterview(null)} />
      )}
    </RecruiterLayout>
  )
}
