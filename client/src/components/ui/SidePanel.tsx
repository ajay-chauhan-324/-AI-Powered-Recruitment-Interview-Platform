import { useEffect, useRef, type ReactNode } from 'react'

interface SidePanelProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * The "contextual appointment details" surface — slides in from the right
 * edge on desktop (384px), a full-width bottom sheet on mobile. Used when
 * something is selected (here: booking a new slot), never a permanent
 * fixture of the layout.
 */
export function SidePanel({ title, onClose, children }: SidePanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end sm:items-stretch">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/20"
      />
      <div
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
            className="rounded-md px-2 py-1 text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
