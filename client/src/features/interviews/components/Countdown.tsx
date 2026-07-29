import { useEffect, useState } from 'react'

function formatDuration(msRemaining: number): string {
  const totalMinutes = Math.max(1, Math.ceil(msRemaining / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

interface CountdownProps {
  startAt: Date
  endAt: Date
  className?: string
}

/** A live-updating "Starts in Xh Ym" / "In progress" / "Ended" label — ticks every 30s, which
 * is plenty of precision for an interview countdown (never needs second-level accuracy). */
export function Countdown({ startAt, endAt, className = '' }: CountdownProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  if (now >= endAt) {
    return <span className={className}>Ended</span>
  }
  if (now >= startAt) {
    return <span className={className}>In progress</span>
  }
  return <span className={className}>Starts in {formatDuration(startAt.getTime() - now.getTime())}</span>
}
