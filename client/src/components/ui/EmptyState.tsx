import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

/** The one empty-state treatment used everywhere — an icon (never just blank space), a
 * meaningful headline (not "No data"), and an optional next action. Consistent across
 * jobs/applications/interviews/candidates lists. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-paper-50 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-100 text-ink-500">
        <Icon size={22} aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-ink-900">{title}</p>
        {description && <p className="mt-1 text-sm text-ink-700">{description}</p>}
      </div>
      {action}
    </div>
  )
}
