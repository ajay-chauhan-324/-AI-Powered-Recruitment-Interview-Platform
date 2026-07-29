export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

/**
 * Vanilla (non-React) theme state — a tiny external store so every consumer (UserNav,
 * RecruiterNav, AdminNav, the landing page header) reads and reacts to the exact same
 * value via useSyncExternalStore, with no context provider needed. The inline script in
 * index.html already applied whatever was in localStorage before React even mounted (no
 * flash); this module is just the reactive, settable half of the same mechanism.
 */
const listeners = new Set<() => void>()

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage unavailable (private browsing, locked-down env) — fall back to system.
  }
  return 'system'
}

let preference: ThemePreference = readStoredPreference()

function applyToDocument(next: ThemePreference) {
  if (next === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', next)
  }
}

export function getThemePreference(): ThemePreference {
  return preference
}

export function setThemePreference(next: ThemePreference): void {
  preference = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Best-effort persistence only — theme still applies for this page load either way.
  }
  applyToDocument(next)
  for (const listener of listeners) listener()
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether the OS/browser currently prefers dark — used to show the correct icon/label for
 * "System" without needing the resolved theme to be its own store. */
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}
