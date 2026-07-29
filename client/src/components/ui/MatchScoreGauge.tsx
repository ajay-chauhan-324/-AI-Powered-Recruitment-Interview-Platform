const TIERS = [
  { min: 90, label: 'Exceptional match', colorVar: '--color-available' },
  { min: 75, label: 'Strong match', colorVar: '--color-amber-600' },
  { min: 60, label: 'Good match', colorVar: '--color-amber-500' },
  { min: 0, label: 'Moderate match', colorVar: '--color-ink-500' },
] as const

function matchTierFor(score: number) {
  return TIERS.find((tier) => score >= tier.min) ?? TIERS[TIERS.length - 1]
}

const SIZE_PX = { sm: 40, md: 64, lg: 88 } as const
const STROKE_PX = { sm: 4, md: 6, lg: 7 } as const

interface MatchScoreGaugeProps {
  score: number
  size?: keyof typeof SIZE_PX
  showLabel?: boolean
  className?: string
}

/**
 * The one AI-match-score visualization used everywhere it appears (job cards, apply flow,
 * applications list, recruiter review) — an explainable ring, never a bare number. Color
 * communicates tier as a *reinforcement* of the printed number, not the sole signal.
 */
export function MatchScoreGauge({ score, size = 'md', showLabel = false, className = '' }: MatchScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score))
  const tier = matchTierFor(clamped)
  const px = SIZE_PX[size]
  const stroke = STROKE_PX[size]
  const radius = (px - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div className="relative shrink-0" style={{ width: px, height: px }}>
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="-rotate-90">
          <circle cx={px / 2} cy={px / 2} r={radius} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke={`var(${tier.colorVar})`}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 500ms ease-out' }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-mono font-medium tabular-nums text-ink-900"
          style={{ fontSize: size === 'sm' ? 11 : size === 'md' ? 16 : 20 }}
        >
          {Math.round(clamped)}
        </span>
      </div>
      {showLabel && (
        <div>
          <p className="text-sm font-medium text-ink-900">AI-estimated job fit</p>
          <p className="text-xs text-ink-700">{tier.label} — an estimate, not a final verdict.</p>
        </div>
      )}
    </div>
  )
}
