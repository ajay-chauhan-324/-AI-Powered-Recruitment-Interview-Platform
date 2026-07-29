import { Check, X } from 'lucide-react'

export type SkillChipTone = 'matched' | 'missing' | 'neutral'

const TONE_CLASSES: Record<SkillChipTone, string> = {
  matched: 'border-available/40 bg-available/10 text-available',
  missing: 'border-conflict/30 bg-conflict-tint/60 text-conflict',
  neutral: 'border-hairline text-ink-700',
}

interface SkillChipProps {
  label: string
  tone?: SkillChipTone
}

/** A skill pill used in job cards, job detail requirements, and AI match breakdowns — the
 * icon is the actual signal (never color alone) for matched vs. missing. */
export function SkillChip({ label, tone = 'neutral' }: SkillChipProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {tone === 'matched' && <Check size={11} aria-hidden="true" />}
      {tone === 'missing' && <X size={11} aria-hidden="true" />}
      {label}
    </span>
  )
}
