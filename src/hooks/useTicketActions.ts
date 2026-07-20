import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-timeline'] })
      void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-health'] })
      void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-timeline'] })
      void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-health'] })
      void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
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
