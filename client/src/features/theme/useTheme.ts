import { useSyncExternalStore } from 'react'
import { getThemePreference, setThemePreference, subscribeToTheme, systemPrefersDark, type ThemePreference } from './themeStore'

export function useTheme(): { preference: ThemePreference; setPreference: (next: ThemePreference) => void; isDark: boolean } {
  const preference = useSyncExternalStore(subscribeToTheme, getThemePreference, () => 'system' as ThemePreference)
  const isDark = preference === 'dark' || (preference === 'system' && systemPrefersDark())

  return { preference, setPreference: setThemePreference, isDark }
}
