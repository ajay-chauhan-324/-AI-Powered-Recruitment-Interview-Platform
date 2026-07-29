interface SkeletonProps {
  className?: string
}

/** A pulsing placeholder block — used instead of plain "Loading…" text so loading states
 * feel premium and hint at the shape of what's coming, not just a blank pause. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-paper-200 ${className}`} aria-hidden="true" />
}

/** A skeleton shaped like the job/application card layouts used throughout the app —
 * avoids every page hand-rolling its own loading skeleton shape. */
export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-hairline bg-paper-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 shrink-0 rounded-pill" />
      </div>
    </div>
  )
}
