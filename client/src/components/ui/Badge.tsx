import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-hairline text-ink-700',
  success: 'border-available/40 bg-available/10 text-available',
  warning: 'border-amber-600/40 bg-amber-100 text-ink-900',
  danger: 'border-conflict/40 bg-conflict-tint text-conflict',
  info: 'border-amber-600/30 text-amber-600',
}

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

/** The one status-pill treatment used everywhere (job status, application stage, ATS
 * confidence, interview status) — status is never conveyed by color alone (the tone also
 * changes the border/label), consistent with this project's accessibility rule. */
export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
