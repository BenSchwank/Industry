import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TicketPriority } from '../types/database'

export interface PendingTicket {
  localId: string
  machine_id: string
  machine_name: string
  description: string
  priority: TicketPriority
  created_at: string
  syncError?: string
}

interface OfflineTicketState {
  pending: PendingTicket[]
  addPending: (ticket: Omit<PendingTicket, 'localId' | 'created_at'>, localId?: string) => string
  removePending: (localId: string) => void
  markSyncError: (localId: string, error: string) => void
}

export const useOfflineTicketStore = create<OfflineTicketState>()(
  persist(
    (set) => ({
      pending: [],
      addPending: (ticket, existingLocalId) => {
        const localId = existingLocalId ?? crypto.randomUUID()
        set((state) => ({
          pending: [
            ...state.pending,
            { ...ticket, localId, created_at: new Date().toISOString() },
          ],
        }))
        return localId
      },
      removePending: (localId) =>
        set((state) => ({ pending: state.pending.filter((t) => t.localId !== localId) })),
      markSyncError: (localId, error) =>
        set((state) => ({
          pending: state.pending.map((t) =>
            t.localId === localId ? { ...t, syncError: error } : t,
          ),
        })),
    }),
    { name: 'kwd-offline-tickets' },
  ),
)
