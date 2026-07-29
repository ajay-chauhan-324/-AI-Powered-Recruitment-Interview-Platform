import type { ReactNode } from 'react'
import { UserNav } from './UserNav'
import { MobileTabBar } from './MobileTabBar'

/** The shared page frame for every authenticated candidate route (dashboard, interviews,
 * calendar, ai, settings) — a persistent top nav, a normal scrolling document body, and a
 * mobile bottom tab bar. Unlike the Time Canvas app (CalendarApp/AppShell), these are
 * ordinary scrollable pages, not a single fixed-viewport surface. */
export function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper-100">
      <UserNav />
      <main className="pb-20 sm:pb-0">{children}</main>
      <MobileTabBar />
    </div>
  )
}
