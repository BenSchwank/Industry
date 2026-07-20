import { useQuery } from '@tanstack/react-query'
import { computeUptimeDays } from '../lib/machineHealth'
import { supabase } from '../lib/supabase'

export function useMachineHealth(machineId: string | null) {
  return useQuery({
    queryKey: ['machine-health', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, status, resolved_at, created_at')
        .eq('machine_id', machineId!)
        .order('created_at', { ascending: false })

      if (error) throw error

      const tickets = data ?? []
      const hasOpenTickets = tickets.some((t) => t.status === 'open' || t.status === 'in_progress')
      const resolvedDates = tickets
        .map((t) => t.resolved_at)
        .filter(Boolean) as string[]

      const lastResolvedAt =
        resolvedDates.length > 0
          ? resolvedDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
          : null

      return {
        hasOpenTickets,
        lastResolvedAt,
        uptimeDays: computeUptimeDays(lastResolvedAt),
        openTicketCount: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
      }
    },
    staleTime: 1000 * 60,
  })
}
