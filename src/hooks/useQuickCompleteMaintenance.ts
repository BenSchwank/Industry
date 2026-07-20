import { useMutation, useQueryClient } from '@tanstack/react-query'
import { completeMaintenanceQuick, type QuickCompleteInput } from '../lib/completeMaintenance'
import { formatSupabaseError } from '../lib/formatError'
import { useAuthStore } from '../stores/authStore'

export function useQuickCompleteMaintenance() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  return useMutation({
    mutationFn: async (input: Omit<QuickCompleteInput, 'completedBy'>) => {
      try {
        return await completeMaintenanceQuick({
          ...input,
          completedBy: user?.id ?? null,
        })
      } catch (e) {
        throw new Error(formatSupabaseError(e))
      }
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['maintenance-completions'] })
      void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machineId] })
      void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
    },
  })
}
