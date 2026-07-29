import type { ReactNode } from 'react'
import { RecruiterNav } from './RecruiterNav'

export function RecruiterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper-100">
      <RecruiterNav />
      <main>{children}</main>
    </div>
  )
}
