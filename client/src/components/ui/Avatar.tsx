const PALETTE = [
  'bg-amber-100 text-ink-900',
  'bg-available/15 text-available',
  'bg-conflict-tint text-conflict',
  'bg-paper-200 text-ink-700',
]

/** Deterministic (same name -> same color every time) so a candidate or company reads as
 * the same visual identity across every list/card it appears in, without needing a real
 * uploaded logo/photo. */
function paletteIndexFor(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return hash % PALETTE.length
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

interface AvatarProps {
  name: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
  /** A real uploaded photo URL — when present, renders the photo instead of the initial. */
  photoUrl?: string
}

export function Avatar({ name, size = 'md', className = '', photoUrl }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const colorClasses = PALETTE[paletteIndexFor(name)]

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        aria-hidden="true"
        className={`shrink-0 rounded-full object-cover ${SIZE_CLASSES[size]} ${className}`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-mono font-medium ${SIZE_CLASSES[size]} ${colorClasses} ${className}`}
    >
      {initial}
    </span>
  )
}
