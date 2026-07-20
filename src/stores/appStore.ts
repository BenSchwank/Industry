import { create } from 'zustand'

export type AppView =
  | 'overview'
  | 'scanner'
  | 'machines'
  | 'inventory'
  | 'tickets'
  | 'maintenance'
  | 'messages'
  | 'import'
  | 'users'
  | 'settings'
  | 'more'

interface AppState {
  activeView: AppView
  isOnline: boolean
  authSkipped: boolean
  /** Admin bleibt auf Login-Freigaben, statt in die App zu springen */
  stayOnApprovals: boolean
  selectedMachineId: string | null
  selectedInventoryItemId: string | null
  machineDetailFocus: boolean
  setActiveView: (view: AppView) => void
  setOnline: (online: boolean) => void
  setAuthSkipped: (skipped: boolean) => void
  setStayOnApprovals: (open: boolean) => void
  setSelectedMachineId: (id: string | null) => void
  setSelectedInventoryItemId: (id: string | null) => void
  setMachineDetailFocus: (focus: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'overview',
  isOnline: navigator.onLine,
  authSkipped: sessionStorage.getItem('kwd-auth-skipped') === 'true',
  stayOnApprovals: false,
  selectedMachineId: null,
  selectedInventoryItemId: null,
  machineDetailFocus: false,
  setActiveView: (view) => set({ activeView: view }),
  setOnline: (online) => set({ isOnline: online }),
  setAuthSkipped: (skipped) => {
    sessionStorage.setItem('kwd-auth-skipped', String(skipped))
    set({ authSkipped: skipped })
  },
  setStayOnApprovals: (open) => set({ stayOnApprovals: open }),
  setSelectedMachineId: (id) => set({ selectedMachineId: id, selectedInventoryItemId: null }),
  setSelectedInventoryItemId: (id) => set({ selectedInventoryItemId: id, selectedMachineId: null }),
  setMachineDetailFocus: (focus) => set({ machineDetailFocus: focus }),
}))
