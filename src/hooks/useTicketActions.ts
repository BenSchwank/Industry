import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { TicketPriority, TicketStatus } from '../types/database'

function invalidateTicketQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['tickets'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-timeline'] })
  void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
  void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-health'] })
  void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
}

/** Störung bearbeiten (Text, Priorität, Status, Bezugspunkt). */
export function useUpdateTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      description?: string
      priority?: TicketPriority
      status?: TicketStatus
      reference_label?: string | null
    }) => {
      const payload: {
        description?: string
        priority?: TicketPriority
        status?: TicketStatus
        resolved_at?: string | null
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
      if (input.reference_label !== undefined) {
        payload.reference_label = input.reference_label?.trim() || null
      }

      const { error } = await supabase.from('tickets').update(payload).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
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
