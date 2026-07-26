import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminSession } from '@/features/admin/hooks/useAdminSession'

/** Authorization belongs to backend code (CLAUDE.md §17) — this guard is a UX convenience
 * (avoid flashing admin UI before redirecting), not the actual security boundary. Every
 * admin API route independently requires a valid session via requireAdminAuth regardless
 * of what the client does. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const session = useAdminSession()

  if (session.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper-50">
        <p className="text-sm text-ink-700">Loading…</p>
      </div>
    )
  }

  if (session.isError || !session.data) {
    return <Navigate to="/admin/login" replace />
  }

  return <>{children}</>
}
