import { create } from 'zustand'

const TIPS_KEY = 'kwd-show-tips'
const NAV_LAYOUT_KEY = 'kwd-nav-layout'
const SIDEBAR_COLLAPSED_KEY = 'kwd-sidebar-collapsed'
const TABLE_ZOOM_KEY = 'kwd-table-zoom'
const TABLE_LIST_MODE_KEY = 'kwd-table-list-mode'
const MACHINE_ORDER_KEY = 'kwd-machine-order'

export type NavLayout = 'sidebar' | 'top'
/** infinite = viele Leerzeilen; continuous = nur nach der letzten Zeile */
export type TableListMode = 'infinite' | 'continuous'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === 'false') return false
    if (v === 'true') return true
  } catch {
    /* ignore */
  }
  return fallback
}

function readNavLayout(): NavLayout {
  try {
    const v = localStorage.getItem(NAV_LAYOUT_KEY)
    if (v === 'top' || v === 'sidebar') return v
  } catch {
    /* ignore */
  }
  return 'sidebar'
}

function readTableListMode(): TableListMode {
  try {
    const v = localStorage.getItem(TABLE_LIST_MODE_KEY)
    if (v === 'infinite' || v === 'continuous') return v
  } catch {
    /* ignore */
  }
  return 'continuous'
}

function readZoom(): number {
  try {
    const n = Number(localStorage.getItem(TABLE_ZOOM_KEY))
    if (Number.isFinite(n) && n >= 0.6 && n <= 1.6) return n
  } catch {
    /* ignore */
  }
  return 1
}

function readMachineOrder(): string[] {
  try {
    const raw = localStorage.getItem(MACHINE_ORDER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed
  } catch {
    /* ignore */
  }
  return []
}

interface PreferencesState {
  showTips: boolean
  setShowTips: (show: boolean) => void
  navLayout: NavLayout
  setNavLayout: (layout: NavLayout) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebarCollapsed: () => void
  tableZoom: number
  setTableZoom: (zoom: number) => void
  tableListMode: TableListMode
  setTableListMode: (mode: TableListMode) => void
  machineOrder: string[]
  setMachineOrder: (ids: string[]) => void
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  showTips: readBool(TIPS_KEY, true),
  setShowTips: (show) => {
    localStorage.setItem(TIPS_KEY, String(show))
    set({ showTips: show })
  },
  navLayout: readNavLayout(),
  setNavLayout: (layout) => {
    localStorage.setItem(NAV_LAYOUT_KEY, layout)
    set({ navLayout: layout })
  },
  sidebarCollapsed: readBool(SIDEBAR_COLLAPSED_KEY, false),
  setSidebarCollapsed: (collapsed) => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    set({ sidebarCollapsed: collapsed })
  },
  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
    set({ sidebarCollapsed: next })
  },
  tableZoom: readZoom(),
  setTableZoom: (zoom) => {
    const clamped = Math.min(1.6, Math.max(0.6, Math.round(zoom * 20) / 20))
    localStorage.setItem(TABLE_ZOOM_KEY, String(clamped))
    set({ tableZoom: clamped })
  },
  tableListMode: readTableListMode(),
  setTableListMode: (mode) => {
    localStorage.setItem(TABLE_LIST_MODE_KEY, mode)
    set({ tableListMode: mode })
  },
  machineOrder: readMachineOrder(),
  setMachineOrder: (ids) => {
    localStorage.setItem(MACHINE_ORDER_KEY, JSON.stringify(ids))
    set({ machineOrder: ids })
  },
}))
