import type { QueryClient } from '@tanstack/react-query'
import { insertTicketRow } from './insertTicket'
import { useOfflineTicketStore } from '../stores/offlineTicketStore'
import { useAuthStore } from '../stores/authStore'
import { queryClient } from './queryClient'
import type { TimelineItem } from '../hooks/useMachineLifecycle'
import type { TicketPriority } from '../types/database'

export interface TicketCreateInput {
  machine_id: string | null
  machine_name: string
  reference_label?: string | null
  description: string
  priority: TicketPriority
  /** Optional: bestehender Lebenszyklus-Eintrag (Reparatur) */
  lifecycle_entry_id?: string | null
}

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
    duration_days: null,
    next_due_date: null,
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
    const { error } = await insertTicketRow({
      machine_id: ticket.machine_id,
      reference_label:
        ticket.reference_label ??
        (ticket.machine_id ? null : ticket.machine_name),
      description: ticket.description,
      priority: ticket.priority,
      status: 'open',
      created_by: createdBy,
      lifecycle_entry_id: ticket.lifecycle_entry_id ?? null,
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
  ticket: TicketCreateInput,
  isOnline: boolean,
): Promise<{
  mode: 'synced' | 'queued' | 'error'
  message?: string
  localId?: string
  ticketId?: string
}> {
  return createTicketOptimistic(ticket, isOnline, queryClient)
}

export async function createTicketOptimistic(
  ticket: TicketCreateInput,
  isOnline: boolean,
  client: QueryClient,
): Promise<{
  mode: 'synced' | 'queued' | 'error'
  message?: string
  localId?: string
  ticketId?: string
}> {
  const localId = crypto.randomUUID()
  if (ticket.machine_id) {
    addOptimisticTimelineEntry(client, ticket.machine_id, ticket.description, localId)
  }

  if (!isOnline) {
    useOfflineTicketStore.getState().addPending(ticket, localId)
    return { mode: 'queued', localId }
  }

  const { data, error } = await insertTicketRow({
    machine_id: ticket.machine_id,
    reference_label:
      ticket.reference_label ??
      (ticket.machine_id ? null : ticket.machine_name),
    description: ticket.description,
    priority: ticket.priority,
    status: 'open',
    created_by: currentUserId(),
    lifecycle_entry_id: ticket.lifecycle_entry_id ?? null,
  })

  if (error) {
    if (error.message.toLowerCase().includes('fetch') || !navigator.onLine) {
      useOfflineTicketStore.getState().addPending(ticket, localId)
      return { mode: 'queued', localId }
    }
    if (ticket.machine_id) {
      client.invalidateQueries({ queryKey: ['machine-timeline', ticket.machine_id] })
    }
    return { mode: 'error', message: error.message }
  }

  const invalidations: Promise<unknown>[] = [
    client.invalidateQueries({ queryKey: ['tickets'] }),
    client.invalidateQueries({ queryKey: ['overview-stats'] }),
    client.invalidateQueries({ queryKey: ['machines-with-stats'] }),
    client.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] }),
  ]
  if (ticket.machine_id) {
    invalidations.push(
      client.invalidateQueries({ queryKey: ['machine-timeline', ticket.machine_id] }),
      client.invalidateQueries({ queryKey: ['machine-health', ticket.machine_id] }),
    )
  }
  await Promise.all(invalidations)

  return {
    mode: 'synced',
    localId,
    ticketId: data && typeof data === 'object' && 'id' in data ? String(data.id) : undefined,
  }
}
