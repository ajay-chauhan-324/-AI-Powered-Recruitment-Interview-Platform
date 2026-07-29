import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { Skeleton } from '@/components/ui/Skeleton'

/** Client-side route guard for the recruiter portal — UX-only, mirrors RequireUser. The
 * real authorization boundary is requireRecruiterAuth on the server, which re-verifies
 * accountType fresh from the database on every request; this only avoids a flash of the
 * recruiter shell for a signed-out visitor or a candidate account. */
export function RequireRecruiter({ children }: { children: ReactNode }) {
  const session = useUserSession()

  if (session.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper-50">
        <Skeleton className="h-8 w-40" />
      </div>
    )
  }
  if (session.isError || !session.data) {
    return <Navigate to="/login" replace state={{ from: '/recruiter/dashboard' }} />
  }
  if (session.data.user.accountType !== 'recruiter') {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}
