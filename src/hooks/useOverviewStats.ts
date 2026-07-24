import { useQuery } from '@tanstack/react-query'
import { addLocalDaysIso, localTodayIso } from '../lib/maintenanceDue'
import { supabase } from '../lib/supabase'

function isHuTitle(title: string | null | undefined) {
  return /hauptuntersuchung|^hu\b/i.test(title ?? '')
}

export function useOverviewStats() {
  return useQuery({
    queryKey: ['overview-stats'],
    queryFn: async () => {
      const today = localTodayIso()
      const in7 = addLocalDaysIso(today, 7)

      const [machines, openTickets, inProgressTickets, dueTasks, soonTasks] =
        await Promise.all([
          supabase.from('machines').select('id', { count: 'exact', head: true }),
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open'),
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'in_progress'),
          // Fällig heute oder früher – HU-Filter clientseitig (Titel kann leicht variieren)
          supabase
            .from('maintenance_tasks')
            .select('id, title, next_due_date')
            .lte('next_due_date', today),
          supabase
            .from('maintenance_tasks')
            .select('id', { count: 'exact', head: true })
            .gt('next_due_date', today)
            .lte('next_due_date', in7),
        ])

      if (dueTasks.error) throw dueTasks.error
      if (soonTasks.error) throw soonTasks.error

      const overdueHu = (dueTasks.data ?? []).filter((t) => isHuTitle(t.title)).length

      return {
        machines: machines.count ?? 0,
        openTickets: (openTickets.count ?? 0) + (inProgressTickets.count ?? 0),
        overdueHu,
        dueSoon: soonTasks.count ?? 0,
      }
    },
    staleTime: 1000 * 60,
  })
}
