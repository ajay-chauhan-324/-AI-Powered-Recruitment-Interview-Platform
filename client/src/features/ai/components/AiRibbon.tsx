import { useId, useState } from 'react'

/**
 * Visual shell only — Phase 1 scope. No conversation, no tool calls, no
 * network requests. Establishes the docked-ribbon interaction shape (single
 * line, expands in place, never a floating chat widget) that Phase 7 wires
 * up to a real AI conversation layer. The aria-live region is scaffolded
 * now so screen-reader support doesn't need to be retrofitted later.
 */
export function AiRibbon() {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const panelId = useId()

  return (
    <div className="shrink-0 border-t border-hairline bg-paper-50">
      {expanded && (
        <div
          id={panelId}
          className="mx-auto max-w-2xl px-4 pb-2 pt-4 sm:px-6"
        >
          <div aria-live="polite" className="sr-only">
            {/* Phase 7 will stream AI responses into this live region. */}
          </div>
          <p className="text-sm text-ink-700">
            Conversation will appear here once the AI command layer is connected.
          </p>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          // No submission behavior yet — visual shell only (Phase 1).
        }}
        className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3 sm:px-6"
      >
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
      </form>
    </div>
  )
}
