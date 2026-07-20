import type { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useOfflineTicketStore } from '../stores/offlineTicketStore'
import { useAuthStore } from '../stores/authStore'
import { queryClient } from './queryClient'
import type { TimelineItem } from '../hooks/useMachineLifecycle'

function addOptimisticTimelineEntry(
  client: QueryClient,
  machineId: string,
  description: string,
  localId: string,
) {
  const username = useAuthStore.getState().profile?.username ?? null
  const optimistic: TimelineItem = {
    id: localId,
    source: 'ticket',
    entry_type: 'ticket',
    title: 'Störung (neu)',
    description,
    occurred_at: new Date().toISOString(),
    created_by_username: username,
  }

  client.setQueryData<TimelineItem[]>(['machine-timeline', machineId], (old) => [
    optimistic,
    ...(old ?? []),
  ])
}

function currentUserId() {
  return useAuthStore.getState().user?.id ?? null
}

export async function syncPendingTickets(): Promise<number> {
  const { pending, removePending, markSyncError } = useOfflineTicketStore.getState()
  if (pending.length === 0) return 0

  let synced = 0
  const createdBy = currentUserId()

  for (const ticket of pending) {
    const { error } = await supabase.from('tickets').insert({
      machine_id: ticket.machine_id,
      description: ticket.description,
      priority: ticket.priority,
      status: 'open',
      created_by: createdBy,
    })

    if (error) {
      markSyncError(ticket.localId, error.message)
      continue
    }

    removePending(ticket.localId)
    synced++
  }

  if (synced > 0) {
    await queryClient.invalidateQueries({ queryKey: ['tickets'] })
    await queryClient.invalidateQueries({ queryKey: ['machine-timeline'] })
    await queryClient.invalidateQueries({ queryKey: ['machine-health'] })
    await queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
    await queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
  }

  return synced
}

export async function createTicket(
  ticket: {
    machine_id: string
    machine_name: string
    description: string
    priority: import('../types/database').TicketPriority
  },
  isOnline: boolean,
): Promise<{ mode: 'synced' | 'queued' | 'error'; message?: string }> {
  return createTicketOptimistic(ticket, isOnline, queryClient)
}

export async function createTicketOptimistic(
  ticket: {
    machine_id: string
    machine_name: string
    description: string
    priority: import('../types/database').TicketPriority
  },
  isOnline: boolean,
  client: QueryClient,
): Promise<{ mode: 'synced' | 'queued' | 'error'; message?: string; localId?: string }> {
  const localId = crypto.randomUUID()
  addOptimisticTimelineEntry(client, ticket.machine_id, ticket.description, localId)

  if (!isOnline) {
    useOfflineTicketStore.getState().addPending(ticket, localId)
    return { mode: 'queued', localId }
  }

  const { error } = await supabase.from('tickets').insert({
    machine_id: ticket.machine_id,
    description: ticket.description,
    priority: ticket.priority,
    status: 'open',
    created_by: currentUserId(),
  })

  if (error) {
    if (error.message.toLowerCase().includes('fetch') || !navigator.onLine) {
      useOfflineTicketStore.getState().addPending(ticket, localId)
      return { mode: 'queued', localId }
    }
    client.invalidateQueries({ queryKey: ['machine-timeline', ticket.machine_id] })
    return { mode: 'error', message: error.message }
  }

  await Promise.all([
    client.invalidateQueries({ queryKey: ['tickets'] }),
    client.invalidateQueries({ queryKey: ['machine-timeline', ticket.machine_id] }),
    client.invalidateQueries({ queryKey: ['machine-health', ticket.machine_id] }),
    client.invalidateQueries({ queryKey: ['overview-stats'] }),
    client.invalidateQueries({ queryKey: ['machines-with-stats'] }),
  ])

  return { mode: 'synced', localId }
}
