import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'

export interface MaintenanceDraft {
  id: string
  machine_id: string
  attachment_id: string | null
  title: string
  frequency_days: number | null
  status: string
  source: string
  ai_model: string | null
  error_message: string | null
  created_at: string
  activated_at: string | null
  items: { id: string; label: string; sort_order: number }[]
}

export function useMaintenanceDrafts(machineId: string | null) {
  return useQuery({
    queryKey: ['maintenance-drafts', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data: drafts, error } = await supabase
        .from('maintenance_plan_drafts')
        .select(
          'id, machine_id, attachment_id, title, frequency_days, status, source, ai_model, error_message, created_at, activated_at',
        )
        .eq('machine_id', machineId!)
        .in('status', ['draft', 'processing', 'ready'])
        .order('created_at', { ascending: false })

      if (error) throw new Error(formatSupabaseError(error))
      if (!drafts?.length) return [] as MaintenanceDraft[]

      const ids = drafts.map((d) => d.id)
      const { data: items } = await supabase
        .from('maintenance_draft_checklist_items')
        .select('id, draft_id, label, sort_order')
        .in('draft_id', ids)
        .order('sort_order')

      return drafts.map((d) => ({
        ...d,
        items: (items ?? [])
          .filter((i) => i.draft_id === d.id)
          .map(({ id, label, sort_order }) => ({ id, label, sort_order })),
      })) satisfies MaintenanceDraft[]
    },
    refetchInterval: (query) => {
      const drafts = query.state.data as MaintenanceDraft[] | undefined
      return drafts?.some((d) => d.status === 'processing') ? 3000 : false
    },
  })
}

export function useUpdateDraftItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string; machineId: string }) => {
      const { error } = await supabase
        .from('maintenance_draft_checklist_items')
        .update({ label: label.trim() })
        .eq('id', id)
      if (error) throw new Error(formatSupabaseError(error))
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-drafts', vars.machineId] })
    },
  })
}

export function useAddDraftItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      draftId,
      label,
      sortOrder,
    }: {
      draftId: string
      label: string
      sortOrder: number
      machineId: string
    }) => {
      const { error } = await supabase.from('maintenance_draft_checklist_items').insert({
        draft_id: draftId,
        label: label.trim(),
        sort_order: sortOrder,
      })
      if (error) throw new Error(formatSupabaseError(error))
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-drafts', vars.machineId] })
    },
  })
}

export function useDeleteDraftItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; machineId: string }) => {
      const { error } = await supabase.from('maintenance_draft_checklist_items').delete().eq('id', id)
      if (error) throw new Error(formatSupabaseError(error))
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-drafts', vars.machineId] })
    },
  })
}

export function useUpdateDraftMeta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      title,
      frequency_days,
    }: {
      id: string
      title: string
      frequency_days: number
      machineId: string
    }) => {
      const { error } = await supabase
        .from('maintenance_plan_drafts')
        .update({ title: title.trim(), frequency_days })
        .eq('id', id)
      if (error) throw new Error(formatSupabaseError(error))
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-drafts', vars.machineId] })
    },
  })
}

export function useActivateMaintenanceDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (draft: MaintenanceDraft) => {
      if (draft.items.length === 0) {
        throw new Error('Mindestens ein Checkpunkt erforderlich.')
      }

      const freq = draft.frequency_days ?? 30
      const nextDue = new Date()
      nextDue.setDate(nextDue.getDate() + freq)

      const { data: task, error: taskError } = await supabase
        .from('maintenance_tasks')
        .insert({
          machine_id: draft.machine_id,
          title: draft.title,
          frequency_days: freq,
          next_due_date: nextDue.toISOString().slice(0, 10),
        })
        .select('id')
        .single()

      if (taskError) throw new Error(formatSupabaseError(taskError))

      const { error: itemsError } = await supabase.from('maintenance_checklist_items').insert(
        draft.items.map((item) => ({
          task_id: task.id,
          label: item.label,
          sort_order: item.sort_order,
        })),
      )

      if (itemsError) throw new Error(formatSupabaseError(itemsError))

      const { error: draftError } = await supabase
        .from('maintenance_plan_drafts')
        .update({ status: 'active', activated_at: new Date().toISOString() })
        .eq('id', draft.id)

      if (draftError) throw new Error(formatSupabaseError(draftError))

      return draft.machine_id
    },
    onSuccess: (machineId) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-drafts', machineId] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
    },
  })
}

export function useRejectMaintenanceDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; machineId: string }) => {
      const { error } = await supabase.from('maintenance_plan_drafts').delete().eq('id', id)
      if (error) throw new Error(formatSupabaseError(error))
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-drafts', vars.machineId] })
    },
  })
}
