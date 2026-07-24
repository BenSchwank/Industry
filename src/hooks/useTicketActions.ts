import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listActiveAssignees } from '../lib/listActiveAssignees'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { TicketPriority, TicketStatus } from '../types/database'

export const TICKET_ASSIGNED_SQL_HINT =
  'Bitte in Supabase SQL ausführen: supabase/FIX_TICKET_ASSIGNED_TO.sql'

function invalidateTicketQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['tickets'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-timeline'] })
  void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
  void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-health'] })
  void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
}

type TicketUpdatePayload = {
  description?: string
  priority?: TicketPriority
  status?: TicketStatus
  resolved_at?: string | null
  assigned_to?: string | null
  reference_label?: string | null
}

async function updateTicketRow(id: string, payload: TicketUpdatePayload): Promise<void> {
  const { error } = await supabase.from('tickets').update(payload).eq('id', id)
  if (!error) return

  if (/assigned_to|schema cache/i.test(error.message) && 'assigned_to' in payload) {
    const { assigned_to: _a, ...without } = payload
    const retry = await supabase.from('tickets').update(without).eq('id', id)
    if (!retry.error) {
      throw new Error(
        `Status gespeichert, Zuständigkeit fehlt in der Datenbank. ${TICKET_ASSIGNED_SQL_HINT}`,
      )
    }
    throw retry.error
  }
  throw error
}

/** Aktive Benutzer für Zuständigen-Auswahl. */
export function useActiveAssignees() {
  return useQuery({
    queryKey: ['active-assignees'],
    queryFn: listActiveAssignees,
    staleTime: 60_000,
  })
}

/** Störung bearbeiten (Text, Priorität, Status, Zuständig, Bezugspunkt). */
export function useUpdateTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      description?: string
      priority?: TicketPriority
      status?: TicketStatus
      assigned_to?: string | null
      reference_label?: string | null
    }) => {
      const payload: {
        description?: string
        priority?: TicketPriority
        status?: TicketStatus
        resolved_at?: string | null
        assigned_to?: string | null
        reference_label?: string | null
      } = {}
      if (input.description !== undefined) payload.description = input.description.trim()
      if (input.priority !== undefined) payload.priority = input.priority
      if (input.status !== undefined) {
        payload.status = input.status
        payload.resolved_at =
          input.status === 'resolved' || input.status === 'closed'
            ? new Date().toISOString()
            : null
      }
      if (input.assigned_to !== undefined) {
        payload.assigned_to = input.assigned_to?.trim() || null
      }
      if (input.reference_label !== undefined) {
        payload.reference_label = input.reference_label?.trim() || null
      }

      await updateTicketRow(input.id, payload)
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** Störung auf „In Arbeit“ setzen und Benutzer zuweisen. */
export function useSetTicketInProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; assigned_to: string }) => {
      const assignee = input.assigned_to.trim()
      if (!assignee) throw new Error('Bitte einen Benutzer wählen')

      await updateTicketRow(input.id, {
        status: 'in_progress',
        resolved_at: null,
        assigned_to: assignee,
      })
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** „In Arbeit“ aufheben – Status Offen, keine Zuständigkeit. */
export function useClearTicketInProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      await updateTicketRow(ticketId, {
        status: 'open',
        resolved_at: null,
        assigned_to: null,
      })
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** Schnell: aktuelle Person übernimmt die Störung. */
export function useClaimTicket() {
  const setInProgress = useSetTicketInProgress()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('Bitte anmelden, um die Störung zu übernehmen')
      await setInProgress.mutateAsync({ id: ticketId, assigned_to: userId })
    },
  })
}

/** Störung als erledigt markieren (bleibt in der Historie). */
export function useResolveTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from('tickets')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', ticketId)
      if (error) throw error
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** Störung dauerhaft löschen. */
export function useDeleteTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.from('tickets').delete().eq('id', ticketId)
      if (error) throw error
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  resolved: 'Erledigt',
  closed: 'Geschlossen',
}

export const TICKET_PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
}

export const TICKET_PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
]

export const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Offen' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'resolved', label: 'Erledigt' },
  { value: 'closed', label: 'Geschlossen' },
]
