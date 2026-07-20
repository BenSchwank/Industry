import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useOverviewStats() {
  return useQuery({
    queryKey: ['overview-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)

      const [machines, tickets, tasks, items, batches] = await Promise.all([
        supabase.from('machines').select('id', { count: 'exact', head: true }),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase
          .from('maintenance_tasks')
          .select('id', { count: 'exact', head: true })
          .lt('next_due_date', today),
        supabase.from('inventory_items').select('id, min_stock_level'),
        supabase.from('inventory_batches').select('item_id, quantity'),
      ])

      const stockMap = new Map<string, number>()
      for (const b of batches.data ?? []) {
        stockMap.set(b.item_id, (stockMap.get(b.item_id) ?? 0) + b.quantity)
      }

      let lowStock = 0
      for (const item of items.data ?? []) {
        const stock = stockMap.get(item.id) ?? 0
        if (stock < item.min_stock_level) lowStock++
      }

      return {
        machines: machines.count ?? 0,
        openTickets: tickets.count ?? 0,
        overdueMaintenance: tasks.count ?? 0,
        lowStockItems: lowStock,
      }
    },
    staleTime: 1000 * 60,
  })
}
