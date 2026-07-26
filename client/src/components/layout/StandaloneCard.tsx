import type { ReactNode } from 'react'

interface StandaloneCardProps {
  title: string
  children: ReactNode
}

/**
 * The shared shell for pages reached outside the main app frame (admin login, guest
 * manage-interview) — previously each page floated its own small card directly on
 * `bg-paper-50`, which is the same flat tone as the card itself, so the page read as an
 * almost-empty void with a shrunken box in it. Giving the page a slightly deeper `paper-100`
 * field behind a `paper-50` card creates real depth using only existing tokens (no
 * gradients/blur — CLAUDE.md §6), and the amber top edge plus a header rule borrows the
 * same "letterhead" language as the main app's header divider instead of introducing a new
 * visual idiom.
 */
export function StandaloneCard({ title, children }: StandaloneCardProps) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-paper-100 px-4 py-12 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-hairline bg-paper-50 shadow-panel">
        <div className="h-1 bg-amber-600" aria-hidden="true" />
        <div className="border-b border-hairline px-6 py-4">
          <span className="font-mono text-sm font-medium tracking-wide text-ink-900">{title}</span>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  )
}
