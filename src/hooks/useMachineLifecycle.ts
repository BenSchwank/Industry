import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveUsernames } from '../lib/resolveUsernames'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { LifecycleEntryType } from '../types/database'

export interface LifecycleEntryInput {
  machine_id: string
  entry_type: LifecycleEntryType
  title: string
  description?: string | null
  occurred_at?: string
}

export interface TimelineItem {
  id: string
  source: 'lifecycle' | 'completion' | 'ticket'
  entry_type: LifecycleEntryType | 'ticket'
  title: string
  description: string | null
  occurred_at: string
  /** Benutzername aus profiles – zum Nachfragen im Labor etc. */
  created_by_username: string | null
}

export function useMachineTimeline(machineId: string | null) {
  return useQuery({
    queryKey: ['machine-timeline', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      let lifecycleData: {
        id: string
        entry_type: LifecycleEntryType
        title: string
        description: string | null
        occurred_at: string
        created_by: string | null
      }[] = []

      const lifecycleRes = await supabase
        .from('machine_lifecycle_entries')
        .select('id, entry_type, title, description, occurred_at, created_by')
        .eq('machine_id', machineId!)
        .order('occurred_at', { ascending: false })

      if (!lifecycleRes.error) {
        lifecycleData = (lifecycleRes.data ?? []) as typeof lifecycleData
      } else if (!/created_by/i.test(lifecycleRes.error.message)) {
        // Spalte fehlt noch → ohne created_by laden
        const fallback = await supabase
          .from('machine_lifecycle_entries')
          .select('id, entry_type, title, description, occurred_at')
          .eq('machine_id', machineId!)
          .order('occurred_at', { ascending: false })
        if (!fallback.error) {
          lifecycleData = (fallback.data ?? []).map((e) => ({
            ...e,
            created_by: null,
          })) as typeof lifecycleData
        }
      }

      const [tasks, ticketsRes] = await Promise.all([
        supabase.from('maintenance_tasks').select('id').eq('machine_id', machineId!),
        supabase
          .from('tickets')
          .select('id, description, status, priority, created_at, resolved_at, created_by')
          .eq('machine_id', machineId!)
          .order('created_at', { ascending: false }),
      ])

      if (tasks.error) throw tasks.error

      let tickets = ticketsRes.data
      if (ticketsRes.error) {
        if (/created_by/i.test(ticketsRes.error.message)) {
          const fb = await supabase
            .from('tickets')
            .select('id, description, status, priority, created_at, resolved_at')
            .eq('machine_id', machineId!)
            .order('created_at', { ascending: false })
          if (fb.error) throw fb.error
          tickets = (fb.data ?? []).map((t) => ({ ...t, created_by: null }))
        } else {
          throw ticketsRes.error
        }
      }

      const taskIds = tasks.data?.map((t) => t.id) ?? []
      let completions: {
        id: string
        completed_at: string
        notes: string | null
        completed_by: string | null
        maintenance_tasks: { title: string } | null
      }[] = []

      if (taskIds.length > 0) {
        const { data, error } = await supabase
          .from('maintenance_completions')
          .select('id, completed_at, notes, completed_by, maintenance_tasks(title)')
          .in('task_id', taskIds)
          .order('completed_at', { ascending: false })
        if (error) throw error
        completions = (data ?? []) as typeof completions
      }

      const actorIds = [
        ...lifecycleData.map((e) => e.created_by),
        ...completions.map((c) => c.completed_by),
        ...(tickets ?? []).map((t) => (t as { created_by?: string | null }).created_by),
      ]
      const names = await resolveUsernames(actorIds)

      const items: TimelineItem[] = []

      for (const e of lifecycleData) {
        items.push({
          id: e.id,
          source: 'lifecycle',
          entry_type: e.entry_type,
          title: e.title,
          description: e.description,
          occurred_at: e.occurred_at,
          created_by_username: e.created_by ? (names.get(e.created_by) ?? null) : null,
        })
      }

      for (const c of completions) {
        const task = c.maintenance_tasks as { title: string } | null
        items.push({
          id: c.id,
          source: 'completion',
          entry_type: 'maintenance',
          title: task?.title ?? 'Wartung abgeschlossen',
          description: c.notes,
          occurred_at: c.completed_at,
          created_by_username: c.completed_by ? (names.get(c.completed_by) ?? null) : null,
        })
      }

      for (const t of tickets ?? []) {
        const createdBy = (t as { created_by?: string | null }).created_by ?? null
        items.push({
          id: t.id,
          source: 'ticket',
          entry_type: 'ticket',
          title: `Störung (${t.priority}) – ${t.status}`,
          description: t.description,
          occurred_at: t.resolved_at ?? t.created_at,
          created_by_username: createdBy ? (names.get(createdBy) ?? null) : null,
        })
      }

      items.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      return items
    },
  })
}

export function useAddLifecycleEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: LifecycleEntryInput) => {
      const userId = useAuthStore.getState().user?.id ?? null
      const { data, error } = await supabase
        .from('machine_lifecycle_entries')
        .insert({
          machine_id: input.machine_id,
          entry_type: input.entry_type,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          occurred_at: input.occurred_at ?? new Date().toISOString(),
          created_by: userId,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machine_id] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
    },
  })
}

export type TimelineDeleteTarget = { id: string; source: TimelineItem['source'] }

export function useDeleteTimelineEntries() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      machineId,
      targets,
    }: {
      machineId: string
      targets: TimelineDeleteTarget[]
    }) => {
      const bySource = {
        lifecycle: targets.filter((t) => t.source === 'lifecycle').map((t) => t.id),
        completion: targets.filter((t) => t.source === 'completion').map((t) => t.id),
        ticket: targets.filter((t) => t.source === 'ticket').map((t) => t.id),
      }

      if (bySource.lifecycle.length > 0) {
        const { data: photos } = await supabase
          .from('machine_lifecycle_photos')
          .select('storage_path')
          .in('entry_id', bySource.lifecycle)
        const paths = (photos ?? []).map((p) => p.storage_path).filter(Boolean)
        if (paths.length > 0) {
          await supabase.storage.from('machine-lifecycle-media').remove(paths)
        }

        const { error } = await supabase
          .from('machine_lifecycle_entries')
          .delete()
          .in('id', bySource.lifecycle)
        if (error) throw error
      }

      if (bySource.completion.length > 0) {
        await supabase
          .from('maintenance_completion_items')
          .delete()
          .in('completion_id', bySource.completion)
        const { error } = await supabase
          .from('maintenance_completions')
          .delete()
          .in('id', bySource.completion)
        if (error) throw error
      }

      if (bySource.ticket.length > 0) {
        const { error } = await supabase.from('tickets').delete().in('id', bySource.ticket)
        if (error) throw error
      }

      return { deleted: targets.length, machineId }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machineId] })
      queryClient.invalidateQueries({ queryKey: ['lifecycle-photos', vars.machineId] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
    },
  })
}
