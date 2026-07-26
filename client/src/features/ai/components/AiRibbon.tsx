import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendAiChat, type ConversationTurn } from '@/features/ai/api/aiApi'
import { ApiError } from '@/lib/apiClient'

/**
 * The AI command layer (CLAUDE.md §16-18): a real conversation against the backend's
 * provider-agnostic tool-calling loop (server/src/ai/), never a client-side simulation.
 * Every effect (booking, reschedule, cancellation) happens through the same
 * AvailabilityService/AppointmentService the human-facing forms use — this component only
 * renders what the backend already decided and validated.
 */
export function AiRibbon() {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [history, setHistory] = useState<ConversationTurn[]>([])
  const [manageToken, setManageToken] = useState<string | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputId = useId()
  const panelId = useId()
  const logRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [history])

  const mutation = useMutation({
    mutationFn: (nextHistory: ConversationTurn[]) =>
      sendAiChat(nextHistory, Intl.DateTimeFormat().resolvedOptions().timeZone, manageToken),
    onSuccess: (data) => {
      setErrorMessage(null)
      setHistory((prev) => [...prev, { role: 'assistant', content: data.reply }])
      for (const action of data.actions) {
        if (action.type === 'interview_created' && action.manageToken) {
          setManageToken(action.manageToken)
        }
        if (
          action.type === 'interview_created' ||
          action.type === 'interview_updated' ||
          action.type === 'interview_cancelled'
        ) {
          queryClient.invalidateQueries({ queryKey: ['calendar'] })
        }
      }
    },
    onError: (error: unknown) => {
      // Upstream provider failures (502/503) carry a technical message meant for logs, not a
      // person mid-conversation — show a friendly, actionable one instead. Validation errors
      // (400) are specific to what was actually typed and stay useful to show as-is.
      if (error instanceof ApiError && (error.status === 502 || error.status === 503)) {
        setErrorMessage("The assistant is having trouble reaching its AI provider right now — please try again in a moment.")
        return
      }
      setErrorMessage(error instanceof ApiError ? error.message : 'The assistant is unavailable right now.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || mutation.isPending) return

    const nextHistory: ConversationTurn[] = [...history, { role: 'user', content }]
    setHistory(nextHistory)
    setDraft('')
    setErrorMessage(null)
    mutation.mutate(nextHistory)
  }

  function sendPrompt(content: string) {
    if (mutation.isPending) return
    const nextHistory: ConversationTurn[] = [...history, { role: 'user', content }]
    setHistory(nextHistory)
    setDraft('')
    setErrorMessage(null)
    mutation.mutate(nextHistory)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-paper-50 shadow-panel">
      {expanded && (
        <div id={panelId} className="border-b border-hairline bg-paper-100/60">
          <div className="flex items-center gap-1.5 px-4 pt-2.5 sm:px-5">
            <span aria-hidden="true" className="text-xs text-amber-600">
              ⌁
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-ink-700">Ledger Assistant</span>
          </div>
          <div className="px-4 pb-2 pt-1.5 sm:px-5">
            <div ref={logRef} role="log" aria-live="polite" className="flex max-h-64 flex-col gap-2 overflow-y-auto pb-2">
              {history.length === 0 && !mutation.isPending && (
                <div className="flex flex-col gap-2 py-1">
                  <p className="text-sm text-ink-700">Ask in plain language — I'll check availability and handle the rest.</p>
                  <div className="flex flex-wrap gap-2">
                    {['Book me a technical interview tomorrow at 3pm', 'Is Friday morning free for a screening call?'].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => sendPrompt(suggestion)}
                        className="rounded-pill border border-hairline bg-paper-50 px-3 py-1.5 text-xs text-ink-700 hover:border-amber-600/40 hover:text-ink-900"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {history.map((turn, index) => (
              <p
                key={index}
                className={
                  turn.role === 'user'
                    ? 'self-end rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-ink-900'
                    : 'max-w-[85%] self-start rounded-lg bg-paper-100 px-3 py-1.5 text-sm text-ink-900'
                }
              >
                {turn.content}
              </p>
            ))}
            {mutation.isPending && (
              <p className="self-start text-sm text-ink-500" aria-hidden="true">
                Thinking…
              </p>
            )}
          </div>
          {errorMessage && (
            <p role="alert" className="pb-1 text-sm text-conflict">
              {errorMessage}
            </p>
          )}
          {manageToken && (
            <p className="pb-1 text-xs text-ink-500">
              Manage link: <span className="break-all font-mono">{`${window.location.origin}/manage/${manageToken}`}</span>
            </p>
          )}
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 sm:px-5">
        <span aria-hidden="true" className="shrink-0 text-amber-600">
          ⌁
        </span>
        <label htmlFor={inputId} className="sr-only">
          Ask to book, move, or check a time
        </label>
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setExpanded(true)}
          aria-expanded={expanded}
          aria-controls={panelId}
          placeholder="Ask to book, move, or check a time…"
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
  )
}
