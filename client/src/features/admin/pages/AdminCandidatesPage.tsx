import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminCandidateInterviews, fetchAdminCandidates } from '@/features/admin/api/adminApi'
import { AdminNav } from '@/features/admin/components/AdminNav'
import { formatClockFromDate } from '@/features/calendar/lib/layout'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical',
  coding: 'Coding',
  system_design: 'System Design',
  behavioral: 'Behavioral',
  managerial: 'Managerial',
  final: 'Final',
  panel: 'Panel',
  custom: 'Interview',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
}

/** Candidate management: every candidate who has ever booked, searchable by name/email,
 * with a click-through to their full interview history (upcoming, past, cancelled,
 * rescheduled) — reuses the same InterviewService data every other admin view reads. */
export function AdminCandidatesPage() {
  const [search, setSearch] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)

  const candidatesQuery = useQuery({
    queryKey: ['admin-candidates', search],
    queryFn: () => fetchAdminCandidates(search || undefined),
  })

  const candidateInterviewsQuery = useQuery({
    queryKey: ['admin-candidate-interviews', selectedEmail],
    queryFn: () => fetchAdminCandidateInterviews(selectedEmail!),
    enabled: Boolean(selectedEmail),
  })
  useRealtimeInvalidation([['admin-candidates'], ['admin-candidate-interviews']])

  const selectedCandidate = candidatesQuery.data?.candidates.find((c) => c.candidateEmail === selectedEmail)

  return (
    <div className="flex min-h-dvh flex-col bg-paper-100">
      <AdminNav />
      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 px-4 py-8 sm:px-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-xl font-medium text-ink-900">Candidates</h1>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search candidates"
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />

          {candidatesQuery.isLoading && <p className="text-sm text-ink-700">Loading…</p>}
          {candidatesQuery.isError && (
            <p role="alert" className="text-sm text-conflict">
              Couldn't load candidates. Please try again.
            </p>
          )}
          {!candidatesQuery.isError && candidatesQuery.data?.candidates.length === 0 && (
            <p className="text-sm text-ink-700">No candidates {search ? 'match that search' : 'have booked yet'}.</p>
          )}

          <div className="flex flex-col gap-1.5 overflow-y-auto">
            {candidatesQuery.data?.candidates.map((candidate) => (
              <button
                key={candidate.candidateEmail}
                type="button"
                onClick={() => setSelectedEmail(candidate.candidateEmail)}
                className={
                  'flex min-h-11 flex-col items-start rounded-md border px-3 py-2 text-left ' +
                  (selectedEmail === candidate.candidateEmail
                    ? 'border-amber-600/40 bg-amber-100'
                    : 'border-hairline bg-paper-50 hover:border-amber-600/40')
                }
              >
                <span className="text-sm font-medium text-ink-900">{candidate.candidateName}</span>
                <span className="text-xs text-ink-700">{candidate.candidateEmail}</span>
                <span className="mt-1 text-xs text-ink-500">
                  {candidate.totalInterviews} interview{candidate.totalInterviews === 1 ? '' : 's'}
                  {candidate.upcomingCount > 0 ? ` · ${candidate.upcomingCount} upcoming` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 border-l border-hairline pl-6">
          {!selectedEmail && <p className="text-sm text-ink-700">Select a candidate to see their interview history.</p>}
          {selectedEmail && selectedCandidate && (
            <>
              <h2 className="text-lg font-medium text-ink-900">{selectedCandidate.candidateName}</h2>
              <p className="text-sm text-ink-700">{selectedCandidate.candidateEmail}</p>
              {selectedCandidate.candidatePhone && <p className="text-sm text-ink-700">{selectedCandidate.candidatePhone}</p>}

              <h3 className="mt-6 text-sm font-medium uppercase tracking-wide text-ink-700">Interview history</h3>
              {candidateInterviewsQuery.isLoading && <p className="mt-2 text-sm text-ink-700">Loading…</p>}
              {candidateInterviewsQuery.isError && (
                <p role="alert" className="mt-2 text-sm text-conflict">
                  Couldn't load this candidate's interview history. Please try again.
                </p>
              )}
              <div className="mt-2 flex flex-col gap-2">
                {candidateInterviewsQuery.data?.interviews.map((interview) => (
                  <div key={interview.id} className="rounded-md border border-hairline bg-paper-50 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p
                        className={
                          'text-sm font-medium ' +
                          (interview.status === 'cancelled' ? 'text-ink-700 line-through decoration-ink-300' : 'text-ink-900')
                        }
                      >
                        {interview.title}
                      </p>
                      <span className="shrink-0 pl-2 text-xs text-ink-500">{STATUS_LABEL[interview.status] ?? interview.status}</span>
                    </div>
                    <p className="text-xs text-ink-700">
                      {INTERVIEW_TYPE_LABEL[interview.interviewType] ?? interview.interviewType}
                      {interview.round > 1 ? ` · Round ${interview.round}` : ''}
                    </p>
                    <p className="font-mono text-xs tabular-nums text-ink-700">
                      {new Date(interview.startAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                      {formatClockFromDate(new Date(interview.startAt))}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
