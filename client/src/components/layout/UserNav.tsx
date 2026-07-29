import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Briefcase, Calendar, ChevronDown, FileText, LayoutDashboard, LogOut, Settings, Sparkles, Video } from 'lucide-react'
import { logoutUser } from '@/features/auth/api/authApi'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { ThemeToggle } from '@/features/theme/ThemeToggle'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/jobs', label: 'Jobs', Icon: Briefcase },
  { to: '/applications', label: 'Applications', Icon: FileText },
  { to: '/interviews', label: 'My Interviews', Icon: Video },
  { to: '/calendar', label: 'My Calendar', Icon: Calendar },
  { to: '/ai', label: 'AI Assistant', Icon: Sparkles },
]

/** Desktop-and-up top nav for the authenticated candidate app. Mobile gets its own bottom
 * tab bar (MobileTabBar.tsx) instead of a shrunk version of this. */
export function UserNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useUserSession()

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSuccess: () => {
      queryClient.setQueryData(['user-session'], null)
      navigate('/', { replace: true })
    },
  })

  const initial = session.data?.user.name.trim().charAt(0).toUpperCase() || '·'

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-paper-50 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-6 overflow-x-auto">
        <Link to="/dashboard" className="shrink-0 font-mono text-sm font-medium tracking-wide text-ink-900">
          The Ledger
        </Link>
        <nav className="hidden items-center gap-0.5 text-sm text-ink-700 sm:flex">
          {NAV_ITEMS.map((item) => {
            const isCurrent = location.pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isCurrent ? 'page' : undefined}
                className={
                  'flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors ' +
                  (isCurrent ? 'text-ink-900' : 'text-ink-700 hover:bg-paper-100 hover:text-ink-900')
                }
              >
                <item.Icon size={16} aria-hidden="true" className={isCurrent ? 'text-amber-600' : ''} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-paper-100 py-1 pl-1 pr-2.5 hover:border-amber-600/40"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-200 font-mono text-xs font-medium text-ink-900">
                {initial}
              </span>
              <ChevronDown size={14} aria-hidden="true" className="text-ink-500" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-56 overflow-hidden rounded-lg border border-hairline bg-paper-50 py-1 shadow-panel data-[state=open]:animate-[popover-in_140ms_ease-out] data-[state=closed]:animate-[popover-out_120ms_ease-in]"
            >
              {session.data && (
                <div className="border-b border-hairline px-4 py-3">
                  <p className="truncate text-sm font-medium text-ink-900">{session.data.user.name}</p>
                  <p className="truncate text-xs text-ink-500">{session.data.user.email}</p>
                </div>
              )}
              <DropdownMenu.Item asChild>
                <Link
                  to="/settings"
                  className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm text-ink-700 outline-none hover:bg-paper-100 hover:text-ink-900 focus:bg-paper-100 focus:text-ink-900"
                >
                  <Settings size={16} aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => logoutMutation.mutate()}
                className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm text-ink-700 outline-none hover:bg-conflict-tint hover:text-conflict focus:bg-conflict-tint focus:text-conflict"
              >
                <LogOut size={16} aria-hidden="true" />
                Log out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
