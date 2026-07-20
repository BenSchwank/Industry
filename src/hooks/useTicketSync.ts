import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

export function useTicketSync() {
  const isOnline = useAppStore((s) => s.isOnline)

  useEffect(() => {
    if (!isOnline) return

    import('../lib/syncTickets').then(({ syncPendingTickets }) => {
      syncPendingTickets()
    })
  }, [isOnline])
}

export function useTicketsRealtime() {
  useEffect(() => {
    const channel = supabase
      .channel('tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        import('../lib/queryClient').then(({ queryClient }) => {
          queryClient.invalidateQueries({ queryKey: ['tickets'] })
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
