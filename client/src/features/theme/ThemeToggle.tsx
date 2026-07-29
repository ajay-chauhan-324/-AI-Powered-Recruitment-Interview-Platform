import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from './useTheme'
import type { ThemePreference } from './themeStore'

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

/** A compact theme picker (Radix DropdownMenu — real keyboard nav/focus trap, not a
 * hand-rolled popover) meant to live in every top nav. Icon reflects the resolved theme
 * (system shows sun/moon depending on the OS), label always shows the stored preference. */
export function ThemeToggle() {
  const { preference, setPreference, isDark } = useTheme()
  const CurrentIcon = isDark ? Moon : Sun

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Change theme"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-paper-50 text-ink-700 hover:border-amber-600/40 hover:text-ink-900"
        >
          <CurrentIcon size={18} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-40 overflow-hidden rounded-lg border border-hairline bg-paper-50 py-1 shadow-panel data-[state=open]:animate-[popover-in_140ms_ease-out] data-[state=closed]:animate-[popover-out_120ms_ease-in]"
        >
          {OPTIONS.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => setPreference(option.value)}
              className="flex min-h-10 cursor-pointer items-center gap-2 px-3 text-sm text-ink-700 outline-none hover:bg-paper-100 hover:text-ink-900 focus:bg-paper-100 focus:text-ink-900"
            >
              <option.Icon size={16} aria-hidden="true" />
              <span className="flex-1">{option.label}</span>
              {preference === option.value && <Check size={14} aria-hidden="true" className="text-amber-600" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
