import { useEffect, useRef, type ReactNode } from 'react'

interface SidePanelProps {
  title: string
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The "contextual interview details" surface — slides in from the right
 * edge on desktop (384px), a full-width bottom sheet on mobile. Used when
 * something is selected (here: booking a new slot), never a permanent
 * fixture of the layout.
 */
export function SidePanel({ title, onClose, children }: SidePanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      // A minimal focus trap: aria-modal="true" tells assistive tech the background is
      // inert, but that alone doesn't stop a sighted keyboard user from Tabbing into it —
      // this keeps Tab/Shift+Tab cycling within the dialog instead.
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end sm:items-stretch">
      {/* Click-to-dismiss backdrop — a mouse-only convenience. Hidden from the accessibility
          tree and removed from tab order so keyboard/screen-reader users don't encounter a
          second, indistinguishable "Close" control before reaching the real one below
          (Escape and the visible X button are their actual close affordances). */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/20"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex w-full max-h-[85dvh] flex-col overflow-y-auto rounded-t-lg border-t border-hairline bg-paper-50 shadow-panel sm:h-full sm:max-h-none sm:w-96 sm:rounded-none sm:rounded-l-lg sm:border-l sm:border-t-0"
        style={{ marginTop: 'auto' }}
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-md font-medium text-ink-900">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
