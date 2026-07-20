import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { insertLifecycleEntry } from '../lib/insertLifecycleEntry'
import { addDaysIso } from '../lib/maintenanceDue'
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
  /** Nur Wartung: Intervall in Tagen bis zur nächsten */
  duration_days?: number | null
}

export interface TimelineItem {
  id: string
  source: 'lifecycle' | 'completion' | 'ticket'
  entry_type: LifecycleEntryType | 'ticket'
  title: string
  description: string | null
  occurred_at: string
  created_by_username: string | null
  duration_days: number | null
  next_due_date: string | null
}

async function syncMaintenanceTask(
  machineId: string,
  frequencyDays: number,
  nextDueDate: string,
) {
  const { data: existing } = await supabase
    .from('maintenance_tasks')
    .select('id')
    .eq('machine_id', machineId)
    .order('next_due_date', { ascending: true })
    .limit(1)

  if (existing?.[0]?.id) {
    const { error } = await supabase
      .from('maintenance_tasks')
      .update({
        frequency_days: frequencyDays,
        next_due_date: nextDueDate,
        title: 'Wartung',
      })
      .eq('id', existing[0].id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('maintenance_tasks').insert({
      machine_id: machineId,
      title: 'Wartung',
      frequency_days: frequencyDays,
      next_due_date: nextDueDate,
    })
    if (error) throw error
  }
}

export function useMachineTimeline(machineId: string | null) {
  return useQuery({
    queryKey: ['machine-timeline', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      type LifeRow = {
        id: string
        entry_type: LifecycleEntryType
        title: string
        description: string | null
        occurred_at: string
        created_by: string | null
        duration_days: number | null
        next_due_date: string | null
      }

      let lifecycleData: LifeRow[] = []

      const fullSelect =
        'id, entry_type, title, description, occurred_at, created_by, duration_days, next_due_date'
      const lifecycleRes = await supabase
        .from('machine_lifecycle_entries')
        .select(fullSelect)
        .eq('machine_id', machineId!)
        .order('occurred_at', { ascending: false })

      if (!lifecycleRes.error) {
        lifecycleData = (lifecycleRes.data ?? []) as LifeRow[]
      } else {
        const fallback = await supabase
          .from('machine_lifecycle_entries')
          .select('id, entry_type, title, description, occurred_at, created_by')
          .eq('machine_id', machineId!)
          .order('occurred_at', { ascending: false })
        if (!fallback.error) {
          lifecycleData = (fallback.data ?? []).map((e) => ({
            ...e,
            created_by: (e as { created_by?: string | null }).created_by ?? null,
            duration_days: null,
            next_due_date: null,
          })) as LifeRow[]
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
        maintenance_tasks: { title: string; frequency_days: number; next_due_date: string } | null
      }[] = []

      if (taskIds.length > 0) {
        const { data, error } = await supabase
          .from('maintenance_completions')
          .select(
            'id, completed_at, notes, completed_by, maintenance_tasks(title, frequency_days, next_due_date)',
          )
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
          duration_days: e.duration_days,
          next_due_date: e.next_due_date,
        })
      }

      for (const c of completions) {
        const task = c.maintenance_tasks
        items.push({
          id: c.id,
          source: 'completion',
          entry_type: 'maintenance',
          title: task?.title ?? 'Wartung abgeschlossen',
          description: c.notes,
          occurred_at: c.completed_at,
          created_by_username: c.completed_by ? (names.get(c.completed_by) ?? null) : null,
          duration_days: task?.frequency_days ?? null,
          next_due_date: task?.next_due_date ?? null,
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
          duration_days: null,
          next_due_date: null,
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
      const occurred = input.occurred_at ?? new Date().toISOString()
      const duration =
        input.entry_type === 'maintenance' && input.duration_days && input.duration_days > 0
          ? Math.round(input.duration_days)
          : null
      const nextDue = duration != null ? addDaysIso(occurred, duration) : null

      const { data, error } = await insertLifecycleEntry({
        machine_id: input.machine_id,
        entry_type: input.entry_type,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        occurred_at: occurred,
        created_by: userId,
        duration_days: duration,
        next_due_date: nextDue,
      })

      if (error) throw error

      if (duration != null && nextDue) {
        await syncMaintenanceTask(input.machine_id, duration, nextDue)
      }

      return data
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machine_id] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
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
