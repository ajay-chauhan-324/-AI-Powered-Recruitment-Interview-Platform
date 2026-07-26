import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanel } from '@/components/ui/SidePanel'
import { cancelAdminInterview, rescheduleAdminInterview, type AdminInterview } from '@/features/admin/api/adminApi'
import { ApiError } from '@/lib/apiClient'

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical Interview',
  coding: 'Coding Interview',
  system_design: 'System Design Interview',
  behavioral: 'Behavioral Interview',
  managerial: 'Managerial Interview',
  final: 'Final Interview',
  panel: 'Panel Interview',
  custom: 'Interview',
}

interface AdminInterviewPanelProps {
  interview: AdminInterview
  onClose: () => void
}

/**
 * Reschedule and duration changes ("resize") happen through editable form fields rather
 * than a pointer-drag interaction — a deliberate scope choice: this achieves the same
 * outcome with full keyboard accessibility built in from the start, rather than building a
 * bespoke drag/resize handle and a *separate* keyboard path for it.
 */
export function AdminInterviewPanel({ interview, onClose }: AdminInterviewPanelProps) {
  const queryClient = useQueryClient()
  const [startLocal, setStartLocal] = useState(() => toDatetimeLocal(interview.startAt))
  const [durationMinutes, setDurationMinutes] = useState(interview.durationMinutes)
  const [error, setError] = useState<string | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-interviews'] })
    queryClient.invalidateQueries({ queryKey: ['calendar'] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const rescheduleMutation = useMutation({
    mutationFn: () => rescheduleAdminInterview(interview.id, new Date(startLocal).toISOString(), durationMinutes),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelAdminInterview(interview.id),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  const cancelled = interview.status === 'cancelled'
  const candidateLinks = [
    interview.candidateLinkedIn && { label: 'LinkedIn', href: interview.candidateLinkedIn },
    interview.candidateGithub && { label: 'GitHub', href: interview.candidateGithub },
    interview.candidatePortfolioUrl && { label: 'Portfolio', href: interview.candidatePortfolioUrl },
    interview.candidateResumeUrl && { label: 'Resume', href: interview.candidateResumeUrl },
  ].filter(Boolean) as Array<{ label: string; href: string }>

  return (
    <SidePanel title={INTERVIEW_TYPE_LABEL[interview.interviewType] ?? 'Interview'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-md font-medium text-ink-900">{interview.title}</p>
          <p className="text-xs uppercase tracking-wide text-ink-700">
            {INTERVIEW_TYPE_LABEL[interview.interviewType] ?? interview.interviewType}
            {interview.round > 1 ? ` · Round ${interview.round}` : ''} · {interview.status}
          </p>
        </div>

        <div className="rounded-md border border-hairline bg-paper-100 p-3">
          <p className="text-sm font-medium text-ink-900">{interview.candidateName}</p>
          <p className="text-sm text-ink-700">{interview.candidateEmail}</p>
          {interview.candidatePhone && <p className="text-sm text-ink-700">{interview.candidatePhone}</p>}
          {candidateLinks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {candidateLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-amber-600 underline"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
          {interview.candidateNotes && <p className="mt-2 text-sm text-ink-700">"{interview.candidateNotes}"</p>}
        </div>

        <div className="text-sm text-ink-700">
          {interview.locationType === 'video' && interview.meetingUrl && (
            <a
              href={interview.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex min-h-11 w-fit items-center rounded-pill border border-amber-600 bg-amber-100 px-3 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
            >
              Join interview
            </a>
          )}
          {interview.locationType === 'onsite' && interview.address && <p>Location: {interview.address}</p>}
          {interview.locationType === 'phone' && <p>Format: Phone call</p>}
          {interview.interviewerName && <p>Interviewer: {interview.interviewerName}</p>}
        </div>

        {interview.rescheduleHistory.length > 0 && (
          <details className="text-xs text-ink-700">
            <summary className="cursor-pointer font-medium">Reschedule history ({interview.rescheduleHistory.length})</summary>
            <ul className="mt-1 flex flex-col gap-1">
              {interview.rescheduleHistory.map((entry, index) => (
                <li key={index}>
                  Was {new Date(entry.previousStartAt).toLocaleString()} → changed {new Date(entry.changedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </details>
        )}

        {cancelled ? (
          <p className="text-sm text-ink-700">This interview has been cancelled.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Start
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(event) => setStartLocal(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Duration (minutes)
              <input
                type="number"
                min={5}
                step={5}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-conflict">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  rescheduleMutation.mutate()
                }}
                disabled={rescheduleMutation.isPending}
                className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Cancel this interview?')) {
                    setError(null)
                    cancelMutation.mutate()
                  }
                }}
                disabled={cancelMutation.isPending}
                className="flex min-h-11 items-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900 disabled:opacity-50"
              >
                Cancel interview
              </button>
            </div>
          </>
        )}
      </div>
    </SidePanel>
  )
}
