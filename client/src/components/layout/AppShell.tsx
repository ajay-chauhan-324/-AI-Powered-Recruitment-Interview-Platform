import type { ReactNode } from 'react'

interface AppShellProps {
  header: ReactNode
  canvas: ReactNode
  ribbon: ReactNode
}

/**
 * The full-viewport layout: header strip, the Time Canvas filling all
 * remaining space, and the AI ribbon floating over the canvas's bottom edge
 * as a docked capsule — not a page footer, and not a separate chat panel.
 * No sidebar slot exists by design — this is not an omission to fill in
 * later.
 */
export function AppShell({ header, canvas, ribbon }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col">
      <a href="#time-canvas" className="sr-only sr-only-focusable">
        Skip to time canvas
      </a>
      {header}
      <main id="time-canvas" className="relative min-h-0 flex-1">
        <div className="absolute inset-0">{canvas}</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 sm:px-6 sm:pb-4">
          <div className="pointer-events-auto w-full max-w-2xl">{ribbon}</div>
        </div>
      </main>
    </div>
  )
}
