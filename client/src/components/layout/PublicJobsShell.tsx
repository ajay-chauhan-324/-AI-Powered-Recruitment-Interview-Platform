import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AuthenticatedLayout } from './AuthenticatedLayout'
import { RecruiterLayout } from './RecruiterLayout'
import { useUserSession } from '@/features/auth/hooks/useUserSession'

/** Job browsing is public (no account required, mirroring the existing guest-booking
 * pattern) — a signed-in candidate gets their normal app shell/nav, a signed-in recruiter
 * gets the recruiter shell/nav instead (a recruiter previewing the public job board must
 * never be wrapped in the candidate's Dashboard/Applications/Interviews chrome — that was
 * this exact class of bug elsewhere in the app), and a signed-out visitor gets a minimal
 * header with sign-in/register links. */
export function PublicJobsShell({ children }: { children: ReactNode }) {
  const session = useUserSession()

  if (session.data?.user.accountType === 'recruiter') {
    return <RecruiterLayout>{children}</RecruiterLayout>
  }
  if (session.data) {
    return <AuthenticatedLayout>{children}</AuthenticatedLayout>
  }

  return (
    <div className="min-h-dvh bg-paper-100">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-paper-50 px-4 sm:px-6">
        <Link to="/" className="font-mono text-sm font-medium tracking-wide text-ink-900">
          The Ledger
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/login" className="flex min-h-11 items-center px-2 text-sm font-medium text-ink-700 hover:text-ink-900">
            Log in
          </Link>
          <Link
            to="/register"
            className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70"
          >
            Get started
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
