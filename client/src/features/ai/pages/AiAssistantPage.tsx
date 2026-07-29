import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Calendar, CalendarPlus, Check, FileText, Search, Sparkles, TrendingUp, Video } from 'lucide-react'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'
import { Button } from '@/components/ui/Button'
import { sendUserAiChat, type AiAction, type ConversationTurn } from '@/features/ai/api/aiApi'
import { fetchMyApplications } from '@/features/applications/api/applicationsApi'
import { fetchMyInterviews } from '@/features/interviews/api/myInterviewsApi'
import { formatClockInTimeZone } from '@/features/calendar/lib/layout'
import { ApiError, ApiRateLimitedError } from '@/lib/apiClient'

/** The AI provider's free-tier daily quota resets at a specific time, not "in a moment" —
 * telling the candidate the real wait avoids them retrying uselessly for hours. */
function formatRateLimitMessage(error: ApiRateLimitedError): string {
  if (!error.resetAt) return "The AI assistant has reached its daily usage limit. Please try again later."
  const resetTime = new Date(error.resetAt).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `The AI assistant has reached its daily usage limit and will be available again around ${resetTime}.`
}

const SUGGESTIONS = [
  { icon: CalendarPlus, label: 'I want to book my interview' },
  { icon: Search, label: 'Find jobs matching my profile' },
  { icon: TrendingUp, label: 'Explain my application status' },
  { icon: FileText, label: 'Show my applications' },
  { icon: Calendar, label: 'Show my upcoming interviews' },
]

function formatDateHeading(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** The lightweight "confirmation seal" moment (CLAUDE.md §22) for a booking made entirely
 * through chat — deliberately minimal, not a duplicate of the full reschedule/cancel surface
 * already on ApplicationsPage/InterviewsPage; "View in My Interviews" links there for that. */
function BookingConfirmationCard({ action }: { action: Extract<AiAction, { type: 'interview_created' }> }) {
  const { interview } = action
  const start = interview.startAt ? new Date(interview.startAt) : null
  const end = interview.endAt ? new Date(interview.endAt) : null

  return (
    <div className="mt-1.5 flex max-w-[85%] flex-col gap-1.5 self-start rounded-md border border-hairline bg-paper-100 px-3 py-2 text-xs">
      <p className="flex items-center gap-1 font-medium text-available">
        <Check size={12} aria-hidden="true" />
        Interview scheduled
      </p>
      {start && end && (
        <p className="font-mono text-xs tabular-nums text-ink-900">
          {formatDateHeading(start)} ·{' '}
          {interview.timezone ? (
            <>
              {formatClockInTimeZone(start, interview.timezone)}–{formatClockInTimeZone(end, interview.timezone)} ({interview.timezone})
            </>
          ) : (
            <>
              {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–
              {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </>
          )}
        </p>
      )}
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        {interview.meetingUrl && (
          <a href={interview.meetingUrl} target="_blank" rel="noreferrer">
            <Button variant="primary" size="sm">
              <Video size={12} aria-hidden="true" />
              Join interview
            </Button>
          </a>
        )}
        <Link to="/interviews">
          <Button variant="secondary" size="sm">
            View in My Interviews
          </Button>
        </Link>
      </div>
    </div>
  )
}

/**
 * A first-class, full-page AI assistant for signed-in candidates — the same tool-calling
 * loop and authorization boundary as the guest AiRibbon (server/src/ai/), scoped to a
 * distinct 'user' AiContext so it can only ever see or change this account's own interviews.
 */
export function AiAssistantPage() {
  const [history, setHistory] = useState<ConversationTurn[]>([])
  // Actions returned alongside an assistant turn, keyed by that turn's index in `history` —
  // lets a booking confirmation render directly under the message that produced it, rather
  // than as a disconnected flat list.
  const [actionsByTurn, setActionsByTurn] = useState<Record<number, AiAction[]>>({})
  const [draft, setDraft] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Tracked explicitly rather than trusting TanStack Query's own `mutation.isPending` — this
  // free-tier AI model can legitimately take 60-90+ seconds for a tool-calling turn, and
  // `isPending` has been observed staying stuck true past when onSuccess already ran under
  // exactly that kind of very-long-request timing.
  const [isSending, setIsSending] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Booking is now the primary workflow through this chat (never a manual slot picker) — a
  // candidate arriving via a "Book with AI" link on a specific application carries that
  // application's id as a UX hint only; every tool still re-verifies ownership server-side.
  const [searchParams] = useSearchParams()
  const activeApplicationId = searchParams.get('applicationId') ?? undefined
  const seededApplicationRef = useRef(false)

  const applicationsQuery = useQuery({ queryKey: ['my-applications'], queryFn: fetchMyApplications })
  const interviewsQuery = useQuery({ queryKey: ['my-interviews'], queryFn: fetchMyInterviews })
  const applicationCount = applicationsQuery.data?.applications.length ?? 0
  const upcomingInterviewCount =
    interviewsQuery.data?.interviews.filter((interview) => interview.status !== 'cancelled' && new Date(interview.startAt) > new Date())
      .length ?? 0

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [history])

  const mutation = useMutation({
    mutationFn: (nextHistory: ConversationTurn[]) =>
      sendUserAiChat(nextHistory, Intl.DateTimeFormat().resolvedOptions().timeZone, activeApplicationId),
    onSuccess: (data) => {
      setIsSending(false)
      setErrorMessage(null)
      setHistory((prev) => {
        const next: ConversationTurn[] = [...prev, { role: 'assistant', content: data.reply }]
        if (data.actions.length > 0) {
          const turnIndex = next.length - 1
          setActionsByTurn((prevActions) => ({ ...prevActions, [turnIndex]: data.actions }))
        }
        return next
      })
      const changed = data.actions.some((action) =>
        ['interview_created', 'interview_updated', 'interview_cancelled'].includes(action.type),
      )
      if (changed) {
        // Round status/interviewId live on the application document, not the interview, so a
        // booking made through chat must invalidate my-applications too, not just my-interviews.
        queryClient.invalidateQueries({ queryKey: ['my-interviews'] })
        queryClient.invalidateQueries({ queryKey: ['my-applications'] })
        queryClient.invalidateQueries({ queryKey: ['calendar'] })
      }
    },
    onError: (error: unknown) => {
      setIsSending(false)
      if (error instanceof ApiRateLimitedError) {
        setErrorMessage(formatRateLimitMessage(error))
        return
      }
      if (error instanceof ApiError && (error.status === 502 || error.status === 503)) {
        setErrorMessage('The assistant is having trouble reaching its AI provider right now — please try again in a moment.')
        return
      }
      setErrorMessage(error instanceof ApiError ? error.message : 'The assistant is unavailable right now.')
    },
  })

  function sendPrompt(content: string) {
    if (isSending || !content.trim()) return
    const nextHistory: ConversationTurn[] = [...history, { role: 'user', content: content.trim() }]
    setHistory(nextHistory)
    setDraft('')
    setErrorMessage(null)
    setIsSending(true)
    mutation.mutate(nextHistory)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    sendPrompt(draft)
  }

  // Arriving from a specific application's "Book with AI" button — open the conversation
  // with a natural opening line rather than making the candidate re-explain which role they
  // mean; the applicationId hint travels alongside every request from here on (see mutationFn).
  useEffect(() => {
    if (activeApplicationId && !seededApplicationRef.current && history.length === 0) {
      seededApplicationRef.current = true
      sendPrompt("I'd like to book my interview.")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeApplicationId])

  return (
    <AuthenticatedLayout>
      <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-4 py-6 sm:h-[calc(100dvh-3.5rem)] sm:px-6">
        <div className="shrink-0">
          <h1 className="flex items-center gap-2 text-xl font-medium text-ink-900">
            <Sparkles size={20} aria-hidden="true" className="text-amber-600" />
            AI Assistant
          </h1>
          <p className="mt-1 text-sm text-ink-700">
            Book, reschedule, or cancel an interview entirely by chatting — just say when you're free. Ask about
            applications, job matches, and interviews too.
          </p>
          {(applicationCount > 0 || upcomingInterviewCount > 0) && (
            <p className="mt-2 text-xs text-ink-500">
              {applicationCount} application{applicationCount === 1 ? '' : 's'} · {upcomingInterviewCount} upcoming interview
              {upcomingInterviewCount === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          className="mt-4 flex flex-1 flex-col gap-2.5 overflow-y-auto rounded-lg border border-hairline bg-paper-50 p-4"
        >
          {history.length === 0 && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm text-ink-700">Try asking:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => sendPrompt(suggestion.label)}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-hairline bg-paper-100 px-3 text-left text-sm text-ink-900 hover:border-amber-600/40"
                  >
                    <suggestion.icon size={15} aria-hidden="true" className="shrink-0 text-amber-600" />
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {history.map((turn, index) => {
            const bookingAction = actionsByTurn[index]?.find(
              (action): action is Extract<AiAction, { type: 'interview_created' }> => action.type === 'interview_created',
            )
            return (
              <div key={index} className={turn.role === 'user' ? 'flex flex-col self-end' : 'flex flex-col self-start'}>
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={
                    turn.role === 'user'
                      ? 'max-w-[85%] self-end rounded-lg bg-amber-100 px-3 py-2 text-sm text-ink-900'
                      : 'max-w-[85%] self-start rounded-lg bg-paper-100 px-3 py-2 text-sm text-ink-900'
                  }
                >
                  {turn.content}
                </motion.p>
                {bookingAction && <BookingConfirmationCard action={bookingAction} />}
              </div>
            )
          })}
          {isSending && (
            <p className="flex items-center gap-1.5 self-start text-sm text-ink-500" aria-hidden="true">
              <Sparkles size={13} className="animate-pulse" />
              Thinking…
            </p>
          )}
        </div>

        {errorMessage && (
          <p role="alert" className="mt-2 shrink-0 text-sm text-conflict">
            {errorMessage}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-3 flex shrink-0 items-center gap-2 rounded-pill border border-hairline bg-paper-50 px-4 py-2">
          <span aria-hidden="true" className="text-xs text-amber-600">⌁</span>
          <label htmlFor="ai-assistant-input" className="sr-only">
            Ask the AI assistant about your interviews
          </label>
          <input
            id="ai-assistant-input"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your applications or interviews…"
            className="w-full bg-transparent text-base text-ink-900 placeholder:text-ink-500 focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={isSending || draft.trim().length === 0} className="px-3">
            Send
          </Button>
        </form>
      </div>
    </AuthenticatedLayout>
  )
}
