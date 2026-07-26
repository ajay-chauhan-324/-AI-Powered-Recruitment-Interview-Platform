import { useId } from 'react'

export interface SegmentedControlOption<TValue extends string> {
  value: TValue
  label: string
}

interface SegmentedControlProps<TValue extends string> {
  label: string
  options: ReadonlyArray<SegmentedControlOption<TValue>>
  value: TValue
  onChange: (value: TValue) => void
}

/**
 * A single-selection control implemented as an accessible radiogroup
 * (not styled tabs) since only one zoom level is ever "current" at a time.
 * Used for the Day / Week / Month zoom-level switch.
 */
export function SegmentedControl<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<TValue>) {
  const groupId = useId()

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + direction + options.length) % options.length
    onChange(options[nextIndex].value)
    const nextButton = document.getElementById(`${groupId}-${options[nextIndex].value}`)
    nextButton?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-pill border border-hairline bg-paper-100 p-0.5"
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          // The button itself is the 44px minimum touch target (CLAUDE.md §24); the inner
          // span carries the compact visible pill styling so the control's actual on-screen
          // size stays true to the minimal design instead of growing to match the hit area.
          <button
            key={option.value}
            id={`${groupId}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-pill"
          >
            <span
              className={
                'rounded-pill px-3 py-1 text-sm font-medium transition-colors ' +
                (selected
                  ? 'border border-amber-600/40 bg-amber-100 text-ink-900'
                  : 'border border-transparent text-ink-700')
              }
            >
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
