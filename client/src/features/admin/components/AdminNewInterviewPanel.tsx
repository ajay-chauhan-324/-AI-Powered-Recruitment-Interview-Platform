import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanel } from '@/components/ui/SidePanel'
import { createAdminInterview } from '@/features/admin/api/adminApi'
import type { InterviewLocationType, InterviewType } from '@/features/booking/api/bookingApi'
import { ApiConflictError, ApiError } from '@/lib/apiClient'
import { formatClockFromDate } from '@/features/calendar/lib/layout'
import { DEFAULT_INTERVIEW_DURATION_MINUTES } from '@/features/booking/constants'

interface AdminNewInterviewPanelProps {
  initialStart: Date
  onClose: () => void
}

const INTERVIEW_TYPE_OPTIONS: Array<{ value: InterviewType; label: string }> = [
  { value: 'hr_screening', label: 'HR Screening' },
  { value: 'technical', label: 'Technical Interview' },
  { value: 'coding', label: 'Coding Interview' },
  { value: 'system_design', label: 'System Design Interview' },
  { value: 'behavioral', label: 'Behavioral Interview' },
  { value: 'managerial', label: 'Managerial Interview' },
  { value: 'final', label: 'Final Interview' },
  { value: 'panel', label: 'Panel Interview' },
  { value: 'custom', label: 'Other' },
]

const LOCATION_TYPE_OPTIONS: Array<{ value: InterviewLocationType; label: string }> = [
  { value: 'video', label: 'Video call' },
  { value: 'phone', label: 'Phone call' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'custom', label: 'Other' },
]

export function AdminNewInterviewPanel({ initialStart, onClose }: AdminNewInterviewPanelProps) {
  const queryClient = useQueryClient()
  const [selectedStart, setSelectedStart] = useState(initialStart)
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_INTERVIEW_DURATION_MINUTES)
  const [interviewType, setInterviewType] = useState<InterviewType>('technical')
  const [round, setRound] = useState(1)
  const [locationType, setLocationType] = useState<InterviewLocationType>('video')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [address, setAddress] = useState('')
  const [interviewerName, setInterviewerName] = useState('')
  const [interviewerEmail, setInterviewerEmail] = useState('')
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [candidatePhone, setCandidatePhone] = useState('')
  const [candidateNotes, setCandidateNotes] = useState('')
  const [alternatives, setAlternatives] = useState<Array<{ start: string; end: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      createAdminInterview({
        title: INTERVIEW_TYPE_OPTIONS.find((option) => option.value === interviewType)?.label ?? 'Interview',
        interviewType,
        round,
        locationType,
        meetingUrl: meetingUrl || undefined,
        address: address || undefined,
        interviewerName: interviewerName || undefined,
        interviewerEmail: interviewerEmail || undefined,
        candidateName,
        candidateEmail,
        candidatePhone: candidatePhone || undefined,
        candidateNotes: candidateNotes || undefined,
        startAt: selectedStart.toISOString(),
        durationMinutes,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-interviews'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      onClose()
    },
    onError: (err: unknown) => {
      if (err instanceof ApiConflictError) {
        setAlternatives(err.alternatives)
        setError(err.message)
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    mutation.mutate()
  }

  const endAt = new Date(selectedStart.getTime() + durationMinutes * 60_000)
  const dateLabel = selectedStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <SidePanel title="New interview" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="font-mono text-sm tabular-nums text-ink-700">
          {formatClockFromDate(selectedStart)}–{formatClockFromDate(endAt)}, {dateLabel}
        </p>

        <div className="grid grid-cols-2 gap-3">
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
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Round
            <input
              type="number"
              min={1}
              value={round}
              onChange={(event) => setRound(Number(event.target.value))}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Interview type
          <select
            value={interviewType}
            onChange={(event) => setInterviewType(event.target.value as InterviewType)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          >
            {INTERVIEW_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Format
          <select
            value={locationType}
            onChange={(event) => setLocationType(event.target.value as InterviewLocationType)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          >
            {LOCATION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {locationType === 'video' && (
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Meeting link
            <input
              type="url"
              value={meetingUrl}
              onChange={(event) => setMeetingUrl(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>
        )}
        {locationType === 'onsite' && (
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Address
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Interviewer name
            <input
              value={interviewerName}
              onChange={(event) => setInterviewerName(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Interviewer email
            <input
              type="email"
              value={interviewerEmail}
              onChange={(event) => setInterviewerEmail(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>
        </div>

        <hr className="border-hairline" />

        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Candidate name
          <input
            required
            value={candidateName}
            onChange={(event) => setCandidateName(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Candidate email
          <input
            required
            type="email"
            value={candidateEmail}
            onChange={(event) => setCandidateEmail(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Candidate phone
          <input
            type="tel"
            value={candidatePhone}
            onChange={(event) => setCandidatePhone(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Notes
          <textarea
            value={candidateNotes}
            onChange={(event) => setCandidateNotes(event.target.value)}
            rows={2}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-conflict">
            {error}
          </p>
        )}

        {alternatives && alternatives.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-700">Try one of these times instead:</p>
            <div className="flex flex-wrap gap-2">
              {alternatives.map((alt) => (
                <button
                  key={alt.start}
                  type="button"
                  onClick={() => {
                    setSelectedStart(new Date(alt.start))
                    setAlternatives(null)
                    setError(null)
                  }}
                  className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 font-mono text-xs text-ink-900"
                >
                  {formatClockFromDate(new Date(alt.start))}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-2 flex min-h-11 items-center justify-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
        >
          {mutation.isPending ? 'Creating…' : 'Create interview'}
        </button>
      </form>
    </SidePanel>
  )
}
