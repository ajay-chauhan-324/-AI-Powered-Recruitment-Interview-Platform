import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { Skeleton } from '@/components/ui/Skeleton'

/** Client-side route guard for the candidate-only pages of the candidate/user auth system
 * (dashboard, jobs application flow, interviews, calendar, AI assistant, settings) — mirrors
 * RequireRecruiter.tsx's shape exactly, including its accountType check. UX-only: the real
 * authorization boundary is requireCandidateAuth on the server (candidateAuth.ts), which
 * re-verifies accountType fresh from the database on every request; this only prevents a
 * signed-out visitor, or a recruiter account, from seeing a flash of the candidate shell
 * before the redirect resolves. A recruiter account authenticates through the exact same
 * session/cookie as a candidate (see User.model.ts's accountType), so "signed in" alone is
 * never sufficient here — it must be a signed-in *candidate*. */
export function RequireUser({ children }: { children: ReactNode }) {
  const session = useUserSession()
  const location = useLocation()

  if (session.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper-50">
        <Skeleton className="h-8 w-40" />
      </div>
    )
  }
  if (session.isError || !session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (session.data.user.accountType !== 'candidate') {
    return <Navigate to="/recruiter/dashboard" replace />
  }
  return <>{children}</>
}
