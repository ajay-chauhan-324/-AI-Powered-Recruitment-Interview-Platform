import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Briefcase, CalendarClock, Sparkles, UserSearch, Users } from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { sendRecruiterAiChat, type ConversationTurn } from '@/features/ai/api/aiApi'
import { useRecruiterApplications } from '@/features/recruiter/hooks/useRecruiterApplications'
import { ApiError, ApiRateLimitedError } from '@/lib/apiClient'

/** The AI provider's free-tier daily quota resets at a specific time, not "in a moment" —
 * telling the recruiter the real wait avoids them retrying uselessly for hours. */
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
  { icon: Users, label: 'Show strongest candidates' },
  { icon: Briefcase, label: "Summarize today's applications" },
  { icon: UserSearch, label: 'Which candidates need review?' },
  { icon: CalendarClock, label: 'Block Friday afternoon' },
]

export function RecruiterAiPage() {
  const [history, setHistory] = useState<ConversationTurn[]>([])
  const [draft, setDraft] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { activeJobs, applications } = useRecruiterApplications()

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [history])

  const mutation = useMutation({
    mutationFn: (nextHistory: ConversationTurn[]) =>
      sendRecruiterAiChat(nextHistory, Intl.DateTimeFormat().resolvedOptions().timeZone),
    onSuccess: (data) => {
      setErrorMessage(null)
      setHistory((prev) => [...prev, { role: 'assistant', content: data.reply }])
      const changed = data.actions.some((action) => action.type === 'application_updated' || action.type === 'blocked_slot_created')
      if (changed) {
        queryClient.invalidateQueries({ queryKey: ['job-applications'] })
      }
    },
    onError: (error: unknown) => {
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
    if (mutation.isPending || !content.trim()) return
    const nextHistory: ConversationTurn[] = [...history, { role: 'user', content: content.trim() }]
    setHistory(nextHistory)
    setDraft('')
    setErrorMessage(null)
    mutation.mutate(nextHistory)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    sendPrompt(draft)
  }

  const needsReview = applications.filter((application) => application.status === 'applied' || application.status === 'under_review').length

  return (
    <RecruiterLayout>
      <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-4 py-6 sm:px-6">
        <div className="shrink-0">
          <h1 className="flex items-center gap-2 text-xl font-medium text-ink-900">
            <Sparkles size={20} aria-hidden="true" className="text-amber-600" />
            AI Assistant
          </h1>
          <p className="mt-1 text-sm text-ink-700">Ask about your jobs and candidates, or get help drafting interview questions.</p>
          {(activeJobs.length > 0 || applications.length > 0) && (
            <p className="mt-2 text-xs text-ink-500">
              {activeJobs.length} active job{activeJobs.length === 1 ? '' : 's'} · {applications.length} application
              {applications.length === 1 ? '' : 's'}
              {needsReview > 0 ? ` · ${needsReview} need${needsReview === 1 ? 's' : ''} review` : ''}
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
          {history.map((turn, index) => (
            <motion.p
              key={index}
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
          ))}
          {mutation.isPending && (
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
          <label htmlFor="recruiter-ai-input" className="sr-only">
            Ask the AI assistant about your jobs and applications
          </label>
          <input
            id="recruiter-ai-input"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your hiring pipeline…"
            className="w-full bg-transparent text-base text-ink-900 placeholder:text-ink-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={mutation.isPending || draft.trim().length === 0}
            className="flex min-h-11 shrink-0 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </RecruiterLayout>
  )
}
