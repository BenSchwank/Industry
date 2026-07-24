import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listActiveAssignees } from '../lib/listActiveAssignees'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { TicketPriority, TicketStatus } from '../types/database'

export const TICKET_ASSIGNED_SQL_HINT =
  'Bitte in Supabase SQL ausführen: supabase/FIX_TICKET_ASSIGNED_TO.sql'

function invalidateTicketQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['tickets'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-timeline'] })
  void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
  void queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
  void queryClient.invalidateQueries({ queryKey: ['machine-health'] })
  void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
  void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
  void queryClient.invalidateQueries({ queryKey: ['maintenance-free-repairs'] })
  void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
  void queryClient.invalidateQueries({ queryKey: ['lifecycle-pick'] })
}

export const TICKET_LIFECYCLE_SQL_HINT =
  'Bitte in Supabase SQL ausführen: supabase/FIX_TICKET_LIFECYCLE_LINK.sql'

type TicketUpdatePayload = {
  description?: string
  priority?: TicketPriority
  status?: TicketStatus
  resolved_at?: string | null
  assigned_to?: string | null
  reference_label?: string | null
  lifecycle_entry_id?: string | null
}

async function updateTicketRow(id: string, payload: TicketUpdatePayload): Promise<void> {
  const { error } = await supabase.from('tickets').update(payload).eq('id', id)
  if (!error) return

  if (/assigned_to|schema cache/i.test(error.message) && 'assigned_to' in payload) {
    const { assigned_to: _a, ...without } = payload
    const retry = await supabase.from('tickets').update(without).eq('id', id)
    if (!retry.error) {
      throw new Error(
        `Status gespeichert, Zuständigkeit fehlt in der Datenbank. ${TICKET_ASSIGNED_SQL_HINT}`,
      )
    }
    throw retry.error
  }

  if (/lifecycle_entry_id|schema cache/i.test(error.message) && 'lifecycle_entry_id' in payload) {
    throw new Error(
      `Reparatur-Verknüpfung fehlt in der Datenbank. ${TICKET_LIFECYCLE_SQL_HINT}`,
    )
  }

  throw error
}

/** Aktive Benutzer für Zuständigen-Auswahl. */
export function useActiveAssignees() {
  return useQuery({
    queryKey: ['active-assignees'],
    queryFn: listActiveAssignees,
    staleTime: 60_000,
  })
}

/** Störung bearbeiten (Text, Priorität, Status, Zuständig, Bezugspunkt). */
export function useUpdateTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      description?: string
      priority?: TicketPriority
      status?: TicketStatus
      assigned_to?: string | null
      reference_label?: string | null
    }) => {
      const payload: {
        description?: string
        priority?: TicketPriority
        status?: TicketStatus
        resolved_at?: string | null
        assigned_to?: string | null
        reference_label?: string | null
      } = {}
      if (input.description !== undefined) payload.description = input.description.trim()
      if (input.priority !== undefined) payload.priority = input.priority
      if (input.status !== undefined) {
        payload.status = input.status
        payload.resolved_at =
          input.status === 'resolved' || input.status === 'closed'
            ? new Date().toISOString()
            : null
      }
      if (input.assigned_to !== undefined) {
        payload.assigned_to = input.assigned_to?.trim() || null
      }
      if (input.reference_label !== undefined) {
        payload.reference_label = input.reference_label?.trim() || null
      }

      await updateTicketRow(input.id, payload)
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** Störung auf „In Arbeit“ setzen und Benutzer zuweisen. */
export function useSetTicketInProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; assigned_to: string }) => {
      const assignee = input.assigned_to.trim()
      if (!assignee) throw new Error('Bitte einen Benutzer wählen')

      await updateTicketRow(input.id, {
        status: 'in_progress',
        resolved_at: null,
        assigned_to: assignee,
      })
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** „In Arbeit“ aufheben – Status Offen, keine Zuständigkeit. */
export function useClearTicketInProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      await updateTicketRow(ticketId, {
        status: 'open',
        resolved_at: null,
        assigned_to: null,
      })
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** Schnell: aktuelle Person übernimmt die Störung. */
export function useClaimTicket() {
  const setInProgress = useSetTicketInProgress()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('Bitte anmelden, um die Störung zu übernehmen')
      await setInProgress.mutateAsync({ id: ticketId, assigned_to: userId })
    },
  })
}

/** Störung als geplante Reparatur auf den Reparaturen-Tab übernehmen (optional mit Termin). */
export function usePromoteTicketToRepair() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      ticketId: string
      machineId: string
      title: string
      description?: string | null
      next_due_date?: string | null
    }) => {
      const machineId = input.machineId.trim()
      if (!machineId) {
        throw new Error('Nur Störungen mit Maschine können nach Reparaturen verschoben werden.')
      }

      const title = input.title.trim() || 'Geplante Reparatur'
      const dueRaw = input.next_due_date?.trim() || null
      const occurred = new Date().toISOString()
      const nextDue = dueRaw
        ? dueRaw.includes('T')
          ? dueRaw.slice(0, 10)
          : dueRaw.slice(0, 10)
        : null

      let durationDays: number | null = null
      if (nextDue) {
        const a = new Date(`${occurred.slice(0, 10)}T12:00:00`)
        const b = new Date(`${nextDue}T12:00:00`)
        durationDays = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000))
      }

      const { insertLifecycleEntry } = await import('../lib/insertLifecycleEntry')
      const userId = useAuthStore.getState().user?.id ?? null
      const { data: entry, error: lifeErr } = await insertLifecycleEntry({
        machine_id: machineId,
        entry_type: 'repair',
        title,
        description: input.description?.trim() || null,
        occurred_at: occurred,
        created_by: userId,
        duration_days: durationDays,
        next_due_date: nextDue,
      })
      if (lifeErr) throw lifeErr
      if (!entry?.id) throw new Error('Reparatur-Eintrag konnte nicht angelegt werden')

      // Mit oder ohne Datum: Termin-Aufgabe anlegen, damit sie oben unter Reparaturen steht
      const taskDue = nextDue ?? occurred.slice(0, 10)
      const taskDays = durationDays ?? 30
      const taskTitle = title
      const { data: existing } = await supabase
        .from('maintenance_tasks')
        .select('id')
        .eq('machine_id', machineId)
        .eq('title', taskTitle)
        .limit(1)

      if (existing?.[0]?.id) {
        const { error } = await supabase
          .from('maintenance_tasks')
          .update({
            frequency_days: taskDays,
            next_due_date: taskDue,
            title: taskTitle,
          })
          .eq('id', existing[0].id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('maintenance_tasks').insert({
          machine_id: machineId,
          title: taskTitle,
          frequency_days: taskDays,
          next_due_date: taskDue,
        })
        if (error) throw error
      }

      await updateTicketRow(input.ticketId, { lifecycle_entry_id: entry.id })
      return entry.id as string
    },
    onSuccess: (_id, vars) => {
      invalidateTicketQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machineId] })
      void queryClient.invalidateQueries({ queryKey: ['lifecycle-pick', vars.machineId] })
    },
  })
}

/** Störung als erledigt markieren (bleibt in der Historie). */
export function useResolveTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from('tickets')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', ticketId)
      if (error) throw error
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

/** Störung dauerhaft löschen. */
export function useDeleteTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.from('tickets').delete().eq('id', ticketId)
      if (error) throw error
    },
    onSuccess: () => invalidateTicketQueries(queryClient),
  })
}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  resolved: 'Erledigt',
  closed: 'Geschlossen',
}

export const TICKET_PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
}

export const TICKET_PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
]

export const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Offen' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'resolved', label: 'Erledigt' },
  { value: 'closed', label: 'Geschlossen' },
]
