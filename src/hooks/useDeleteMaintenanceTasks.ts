import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'

/** Geplante Aufgabe(n) entfernen – ohne Abschluss / ohne neue Fälligkeit. */
export function useDeleteMaintenanceTasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return { deleted: 0 }
      const { error } = await supabase.from('maintenance_tasks').delete().in('id', ids)
      if (error) throw new Error(formatSupabaseError(error))
      return { deleted: ids.length }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['checklist-items'] })
      void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-timeline'] })
    },
  })
}
