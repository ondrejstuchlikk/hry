// Appearance settings (Nastavení): theme mode and accent color, saved per device.
// index.html applies the stored values before the first paint; this module keeps them in sync.
import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Accent = 'teal' | 'blue' | 'violet' | 'rose' | 'orange' | 'emerald'

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'teal', label: 'Tyrkysová', swatch: '#0d9488' },
  { id: 'blue', label: 'Modrá', swatch: '#2563eb' },
  { id: 'violet', label: 'Fialová', swatch: '#7c3aed' },
  { id: 'rose', label: 'Růžová', swatch: '#e11d48' },
  { id: 'orange', label: 'Oranžová', swatch: '#ea580c' },
  { id: 'emerald', label: 'Zelená', swatch: '#059669' },
]

export interface Appearance {
  mode: ThemeMode
  accent: Accent
  /** The theme actually shown (system resolved). */
  dark: boolean
}

// Keep in sync with the inline script in index.html.
const STORAGE_KEY = 'hry-appearance'
const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function readStored(): Pick<Appearance, 'mode' | 'accent'> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Appearance>
    const mode = parsed.mode === 'light' || parsed.mode === 'dark' ? parsed.mode : 'system'
    const accent = ACCENTS.some((a) => a.id === parsed.accent) ? parsed.accent! : 'teal'
    return { mode, accent }
  } catch {
    return { mode: 'system', accent: 'teal' }
  }
}

function resolve(stored: Pick<Appearance, 'mode' | 'accent'>): Appearance {
  const dark = stored.mode === 'dark' || (stored.mode === 'system' && Boolean(darkQuery?.matches))
  return { ...stored, dark }
}

let current = resolve(readStored())
const listeners = new Set<() => void>()

function apply() {
  const root = document.documentElement
  root.classList.toggle('dark', current.dark)
  root.dataset.accent = current.accent
  // Browser/PWA chrome follows the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current.dark ? '#141210' : '#f5f5f4')
}

function update(next: Pick<Appearance, 'mode' | 'accent'>) {
  current = resolve(next)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode etc.: the choice still applies until reload.
  }
  apply()
  listeners.forEach((l) => l())
}

export function initTheme() {
  apply()
  darkQuery?.addEventListener('change', () => {
    current = resolve(current)
    apply()
    listeners.forEach((l) => l())
  })
}

export function setThemeMode(mode: ThemeMode) {
  update({ mode, accent: current.accent })
}

export function setAccent(accent: Accent) {
  update({ mode: current.mode, accent })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current)
}
