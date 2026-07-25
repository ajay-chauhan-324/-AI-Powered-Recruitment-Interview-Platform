import type { ReactNode } from 'react'

interface AppShellProps {
  header: ReactNode
  canvas: ReactNode
  ribbon: ReactNode
}

/**
 * The full-viewport layout: header strip, the Time Canvas filling all
 * remaining space, and the AI ribbon docked to the bottom. No sidebar slot
 * exists by design — this is not an omission to fill in later.
 */
export function AppShell({ header, canvas, ribbon }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col">
      <a href="#time-canvas" className="sr-only sr-only-focusable">
        Skip to time canvas
      </a>
      {header}
      <main id="time-canvas" className="min-h-0 flex-1">
        {canvas}
      </main>
      {ribbon}
    </div>
  )
}
