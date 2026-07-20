import { create } from 'zustand'

export type ColorTheme = 'light' | 'dark'

const STORAGE_KEY = 'kwd-theme'

function readStoredTheme(): ColorTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* ignore */
  }
  return 'light'
}

function applyTheme(theme: ColorTheme) {
  document.documentElement.setAttribute('data-theme', theme)
}

interface ThemeState {
  theme: ColorTheme
  setTheme: (theme: ColorTheme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#0b1220')
    set({ theme })
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    get().setTheme(next)
  },
}))

/** Beim App-Start einmal anwenden (vor erstem Paint wenn möglich) */
applyTheme(readStoredTheme())
