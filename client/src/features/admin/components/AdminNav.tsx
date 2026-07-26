import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminLogout } from '@/features/admin/api/adminApi'
import { useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/calendar', label: 'Calendar' },
  { to: '/admin/candidates', label: 'Candidates' },
  { to: '/admin/schedule', label: 'Schedule' },
]

/** Shared top nav for the authenticated recruiter/interviewer workspace — every admin page
 * renders this instead of duplicating its own header markup, so Dashboard/Calendar/
 * Candidates/Schedule always agree on what's available and which one is current. */
export function AdminNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logoutMutation = useMutation({
    mutationFn: () => adminLogout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-session'] })
      navigate('/admin/login', { replace: true })
    },
  })

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-paper-50 px-4 sm:px-6">
      <div className="flex items-center gap-4 overflow-x-auto">
        <span className="shrink-0 font-mono text-sm font-medium tracking-wide text-ink-900">The Ledger — Admin</span>
        <nav className="flex items-center gap-1 text-sm text-ink-700">
          {NAV_ITEMS.map((item) => {
            const isCurrent = location.pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isCurrent ? 'page' : undefined}
                className={
                  'flex min-h-11 shrink-0 items-center rounded-md px-2.5 font-medium ' +
                  (isCurrent ? 'text-ink-900' : 'text-ink-700 hover:text-ink-900')
                }
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <button
        type="button"
        onClick={() => logoutMutation.mutate()}
        className="flex min-h-11 shrink-0 items-center px-2 text-sm text-ink-700 hover:text-ink-900"
      >
        Log out
      </button>
    </header>
  )
}
