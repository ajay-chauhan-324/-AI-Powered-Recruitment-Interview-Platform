import { useId, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanel } from '@/components/ui/SidePanel'
import { createInterview, type InterviewType } from '@/features/booking/api/bookingApi'
import { buildIcsDataUrl } from '@/features/booking/lib/ics'
import { ApiConflictError, ApiError } from '@/lib/apiClient'
import { formatClockFromDate } from '@/features/calendar/lib/layout'

interface BookingPanelProps {
  initialStart: Date
  durationMinutes: number
  onClose: () => void
}

interface Alternative {
  start: string
  end: string
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

/** Falls back to just the detected zone on older engines — Intl.supportedValuesOf is widely
 * supported in current browsers but isn't guaranteed. */
function listTimezones(detected: string): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
    if (supported && supported.length > 0) {
      return [detected, ...supported.filter((zone) => zone !== detected)]
    }
  } catch {
    // fall through
  }
  return [detected]
}

/**
 * The candidate booking flow — reachable by tapping an available slot on the Day view
 * canvas (never a drag), or the header's "Book" entry point. Talks directly to the same
 * InterviewService a future AI tool call also goes through; this is the non-conversational
 * path, not a separate booking implementation.
 */
export function BookingPanel({ initialStart, durationMinutes, onClose }: BookingPanelProps) {
  const queryClient = useQueryClient()
  const detectedTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const timezoneOptions = useMemo(() => listTimezones(detectedTimezone), [detectedTimezone])

  const [selectedStart, setSelectedStart] = useState(initialStart)
  const [timezone, setTimezone] = useState(detectedTimezone)
  const [interviewType, setInterviewType] = useState<InterviewType>('technical')
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [candidatePhone, setCandidatePhone] = useState('')
  const [candidateLinkedIn, setCandidateLinkedIn] = useState('')
  const [candidateGithub, setCandidateGithub] = useState('')
  const [candidatePortfolioUrl, setCandidatePortfolioUrl] = useState('')
  const [candidateResumeUrl, setCandidateResumeUrl] = useState('')
  const [candidateNotes, setCandidateNotes] = useState('')
  const [showMoreDetails, setShowMoreDetails] = useState(false)
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [manageToken, setManageToken] = useState<string | null>(null)
  const [bookedInterviewId, setBookedInterviewId] = useState<string | null>(null)
  const moreDetailsId = useId()

  const mutation = useMutation({
    mutationFn: () =>
      createInterview({
        title: INTERVIEW_TYPE_OPTIONS.find((option) => option.value === interviewType)?.label ?? 'Interview',
        interviewType,
        candidateName,
        candidateEmail,
        candidatePhone: candidatePhone || undefined,
        candidateLinkedIn: candidateLinkedIn || undefined,
        candidateGithub: candidateGithub || undefined,
        candidatePortfolioUrl: candidatePortfolioUrl || undefined,
        candidateResumeUrl: candidateResumeUrl || undefined,
        candidateNotes: candidateNotes || undefined,
        startAt: selectedStart.toISOString(),
        durationMinutes,
        timezone,
      }),
    onSuccess: (data) => {
      setManageToken(data.manageToken)
      setBookedInterviewId(data.interview.id)
      setAlternatives(null)
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: (error: unknown) => {
      if (error instanceof ApiConflictError) {
        setAlternatives(error.alternatives)
        setFormError(error.message)
        return
      }
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    mutation.mutate()
  }

  const endAt = new Date(selectedStart.getTime() + durationMinutes * 60_000)
  const dateLabel = selectedStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const typeLabel = INTERVIEW_TYPE_OPTIONS.find((option) => option.value === interviewType)?.label ?? 'Interview'

  if (manageToken && bookedInterviewId) {
    const manageUrl = `${window.location.origin}/manage/${manageToken}`
    const icsUrl = buildIcsDataUrl({
      uid: `${bookedInterviewId}@the-ledger`,
      title: typeLabel,
      description: `Manage this interview: ${manageUrl}`,
      startAt: selectedStart,
      endAt,
    })

    return (
      <SidePanel title="Interview booked" onClose={onClose}>
        <div className="flex flex-col items-center gap-4 pt-6 text-center">
          <span
            aria-hidden="true"
            className="seal-in flex h-14 w-14 items-center justify-center rounded-full border border-amber-600 bg-amber-100 text-2xl text-ink-900"
          >
            ✓
          </span>
          <div>
            <p className="text-md font-medium text-ink-900">{typeLabel}</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-ink-700">
              {formatClockFromDate(selectedStart)}–{formatClockFromDate(endAt)}, {dateLabel}
            </p>
            <p className="mt-1 text-xs text-ink-500">{timezone}</p>
          </div>
          <p className="text-sm text-ink-700">A confirmation has been sent to {candidateEmail}.</p>
          <p className="text-sm text-ink-700">Save this link to reschedule or cancel later — it won't be shown again.</p>
          <div className="w-full rounded-md border border-hairline bg-paper-100 px-3 py-2">
            <p className="break-all font-mono text-xs text-ink-900">{manageUrl}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(manageUrl)
              }}
              className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
            >
              Copy link
            </button>
            <a
              href={icsUrl}
              download="interview.ics"
              className="flex min-h-11 items-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900"
            >
              Add to calendar
            </a>
          </div>
        </div>
      </SidePanel>
    )
  }

  return (
    <SidePanel title="Book an interview" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-md border border-hairline bg-paper-100 px-3 py-2">
          <p className="font-mono text-sm tabular-nums text-ink-900">
            {formatClockFromDate(selectedStart)}–{formatClockFromDate(endAt)}, {dateLabel}
          </p>
          <p className="text-xs text-ink-700">{timezone}</p>
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
          Your timezone
          <select
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          >
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone === detectedTimezone ? `${zone} (detected)` : zone}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Full name
          <input
            required
            value={candidateName}
            onChange={(event) => setCandidateName(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-700">
          Email
          <input
            required
            type="email"
            value={candidateEmail}
            onChange={(event) => setCandidateEmail(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => setShowMoreDetails((prev) => !prev)}
          aria-expanded={showMoreDetails}
          aria-controls={moreDetailsId}
          className="flex min-h-11 items-center self-start text-sm font-medium text-ink-700 hover:text-ink-900"
        >
          {showMoreDetails ? '− Hide' : '+ Add'} phone, links, resume, or notes (optional)
        </button>

        {showMoreDetails && (
          <div id={moreDetailsId} className="flex flex-col gap-4 rounded-md border border-hairline p-3">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Phone
              <input
                type="tel"
                value={candidatePhone}
                onChange={(event) => setCandidatePhone(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              LinkedIn
              <input
                type="url"
                value={candidateLinkedIn}
                onChange={(event) => setCandidateLinkedIn(event.target.value)}
                placeholder="https://linkedin.com/in/…"
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              GitHub
              <input
                type="url"
                value={candidateGithub}
                onChange={(event) => setCandidateGithub(event.target.value)}
                placeholder="https://github.com/…"
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Portfolio
              <input
                type="url"
                value={candidatePortfolioUrl}
                onChange={(event) => setCandidatePortfolioUrl(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Resume link
              <input
                type="url"
                value={candidateResumeUrl}
                onChange={(event) => setCandidateResumeUrl(event.target.value)}
                placeholder="Link to your resume (Google Drive, Dropbox, etc.)"
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Notes or questions
              <textarea
                value={candidateNotes}
                onChange={(event) => setCandidateNotes(event.target.value)}
                rows={3}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
          </div>
        )}

        {formError && (
          <p role="alert" className="text-sm text-conflict">
            {formError}
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
                    setFormError(null)
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
          {mutation.isPending ? 'Booking…' : 'Confirm interview'}
        </button>
      </form>
    </SidePanel>
  )
}
