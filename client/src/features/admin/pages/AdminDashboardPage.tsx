import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminDashboard } from '@/features/admin/api/adminApi'
import { AdminNav } from '@/features/admin/components/AdminNav'
import { formatClockFromDate } from '@/features/calendar/lib/layout'

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

interface StatCardProps {
  label: string
  value: number
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag">
      <p className="font-mono text-2xl tabular-nums text-ink-900">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-700">{label}</p>
    </div>
  )
}

/**
 * The recruiter/interviewer landing page — this is where "/admin" lands, not the raw
 * calendar. Answers "what needs my attention today" before the admin drills into the full
 * calendar or candidate list.
 */
export function AdminDashboardPage() {
  const dashboardQuery = useQuery({ queryKey: ['admin-dashboard'], queryFn: fetchAdminDashboard, refetchInterval: 60_000 })
  const stats = dashboardQuery.data

  return (
    <div className="flex min-h-dvh flex-col bg-paper-100">
      <AdminNav />
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-700">A quick read on where things stand today.</p>

        {dashboardQuery.isLoading && <p className="mt-6 text-sm text-ink-700">Loading…</p>}

        {stats && !stats.scheduleConfigured && (
          <div className="mt-6 rounded-md border border-amber-600/40 bg-amber-100 px-4 py-3 text-sm text-ink-900">
            No working hours are configured yet — candidates can't book anything until you{' '}
            <Link to="/admin/schedule" className="underline">
              set up your schedule
            </Link>
            .
          </div>
        )}

        {stats && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Today" value={stats.todayCount} />
              <StatCard label="Upcoming" value={stats.upcomingCount} />
              <StatCard label="Total scheduled" value={stats.totalScheduled} />
              <StatCard label="Cancelled" value={stats.cancelledCount} />
            </div>

            <div className="mt-3 rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Rescheduled interviews</p>
              <p className="mt-1 font-mono text-lg tabular-nums text-ink-900">{stats.rescheduledCount}</p>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <Link
                to="/admin/calendar"
                className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
              >
                Schedule an interview
              </Link>
              <Link
                to="/admin/schedule"
                className="flex min-h-11 items-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900"
              >
                Block time
              </Link>
              <Link
                to="/admin/candidates"
                className="flex min-h-11 items-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900"
              >
                View candidates
              </Link>
            </div>

            <section className="mt-10">
              <h2 className="text-md font-medium text-ink-900">Upcoming interviews</h2>
              {stats.upcomingInterviews.length === 0 ? (
                <p className="mt-3 text-sm text-ink-700">Nothing coming up — plenty of open time ahead.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {stats.upcomingInterviews.map((interview) => (
                    <div
                      key={interview.id}
                      className="flex items-center justify-between rounded-md border border-hairline bg-paper-50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">{interview.title}</p>
                        <p className="truncate text-xs text-ink-700">
                          {interview.candidateName} · {INTERVIEW_TYPE_LABEL[interview.interviewType] ?? interview.interviewType}
                          {interview.round > 1 ? ` · Round ${interview.round}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 pl-3 font-mono text-xs tabular-nums text-ink-700">
                        {new Date(interview.startAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                        {formatClockFromDate(new Date(interview.startAt))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
