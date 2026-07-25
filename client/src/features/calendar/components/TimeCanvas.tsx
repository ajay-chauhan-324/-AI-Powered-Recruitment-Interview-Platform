export type CanvasZoom = 'day' | 'week' | 'month'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
})

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Phase 1 foundation only: a static, non-interactive preview of the Time
 * Canvas surface at each zoom level. No real appointment, availability, or
 * blocked-time data exists yet (that's Phase 2 onward) — this establishes
 * the visual/structural scaffold (hour rail, week columns, month grid) that
 * later phases render real data into, without inventing calendar logic
 * (date math, navigation, "today") ahead of Phase 5.
 */
export function TimeCanvas({ zoom }: { zoom: CanvasZoom }) {
  return (
    <div
      role="region"
      aria-label={`${zoom} time canvas (foundation preview)`}
      className="h-full overflow-y-auto"
      tabIndex={0}
    >
      {zoom === 'day' && <DayFoundation />}
      {zoom === 'week' && <WeekFoundation />}
      {zoom === 'month' && <MonthFoundation />}
    </div>
  )
}

function CanvasNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="pointer-events-none sticky top-1/2 z-10 mx-auto max-w-xs -translate-y-1/2 text-center text-sm text-ink-700">
      {children}
    </p>
  )
}

function DayFoundation() {
  return (
    <div className="relative mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <CanvasNote>Appointments, availability, and blocked time will render on this rail.</CanvasNote>
      <ol className="relative">
        {HOUR_LABELS.map((label) => (
          <li key={label} className="flex h-16 items-start gap-4 border-t border-hairline first:border-t-0">
            <span className="w-12 shrink-0 pt-1 font-mono text-xs tabular-nums text-ink-700">{label}</span>
            <span className="w-full" />
          </li>
        ))}
      </ol>
    </div>
  )
}

function WeekFoundation() {
  return (
    <div className="relative mx-auto grid h-full max-w-5xl grid-cols-[3rem_repeat(7,1fr)] px-4 sm:px-6">
      <CanvasNote>Week view: seven columns on one shared time scale.</CanvasNote>
      <div className="col-span-8 grid grid-cols-subgrid border-b border-hairline pb-2 pt-4">
        <span aria-hidden="true" />
        {WEEKDAY_LABELS.map((day) => (
          <span key={day} className="text-center text-xs font-medium uppercase tracking-wide text-ink-700">
            {day}
          </span>
        ))}
      </div>
      <div className="col-span-8 grid grid-cols-subgrid">
        <div className="flex flex-col">
          {HOUR_LABELS.filter((_, i) => i % 2 === 0).map((label) => (
            <span key={label} className="h-12 border-t border-hairline pt-1 font-mono text-xs tabular-nums text-ink-700 first:border-t-0">
              {label}
            </span>
          ))}
        </div>
        {WEEKDAY_LABELS.map((day) => (
          <div key={day} className="border-l border-hairline">
            {HOUR_LABELS.filter((_, i) => i % 2 === 0).map((label) => (
              <div key={label} className="h-12 border-t border-hairline first:border-t-0" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthFoundation() {
  const cells = Array.from({ length: 42 }, (_, index) => index)
  return (
    <div className="relative mx-auto flex h-full max-w-4xl flex-col px-4 py-6 sm:px-6">
      <CanvasNote>Month view: density indicators per day, expanding into Day view.</CanvasNote>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-hairline bg-paper-200">
        {WEEKDAY_LABELS.map((day) => (
          <div key={day} className="bg-paper-100 py-1 text-center text-xs font-medium uppercase tracking-wide text-ink-700">
            {day}
          </div>
        ))}
        {cells.map((cell) => (
          <div key={cell} className="aspect-square bg-paper-50" />
        ))}
      </div>
    </div>
  )
}
