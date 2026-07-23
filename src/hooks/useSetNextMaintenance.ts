import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { setMachineNextMaintenance } from '../lib/setNextMaintenance'

export function useSetNextMaintenance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      machineId,
      nextDueDate,
    }: {
      machineId: string
      nextDueDate: string | null
    }) => {
      try {
        await setMachineNextMaintenance(machineId, nextDueDate)
      } catch (e) {
        throw new Error(formatSupabaseError(e))
      }
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machineId] })
      void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
  })
}
