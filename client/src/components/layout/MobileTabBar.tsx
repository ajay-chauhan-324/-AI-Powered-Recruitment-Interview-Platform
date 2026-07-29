import { Link, useLocation } from 'react-router-dom'
import { Briefcase, FileText, LayoutDashboard, Sparkles, Video } from 'lucide-react'

const TAB_ITEMS = [
  { to: '/dashboard', label: 'Home', Icon: LayoutDashboard },
  { to: '/jobs', label: 'Jobs', Icon: Briefcase },
  { to: '/applications', label: 'Applications', Icon: FileText },
  { to: '/interviews', label: 'Interviews', Icon: Video },
  { to: '/ai', label: 'AI', Icon: Sparkles },
]

/** A genuine mobile navigation pattern (a fixed bottom tab bar), not a shrunk copy of
 * UserNav's desktop links — hidden at sm and above, where UserNav's own nav takes over. */
export function MobileTabBar() {
  const location = useLocation()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-paper-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
    >
      {TAB_ITEMS.map((item) => {
        const isCurrent = location.pathname === item.to
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={isCurrent ? 'page' : undefined}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1"
          >
            <item.Icon size={20} aria-hidden="true" className={isCurrent ? 'text-amber-600' : 'text-ink-500'} />
            <span className={'text-[11px] font-medium ' + (isCurrent ? 'text-ink-900' : 'text-ink-700')}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
