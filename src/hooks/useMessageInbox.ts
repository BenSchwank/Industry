import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type MessageKind =
  | 'maintenance_overdue'
  | 'maintenance_soon'
  | 'ticket_open'
  | 'plan_ready'
  | 'plan_processing'
  | 'plan_failed'
  | 'docs_unanalyzed'

export interface InboxMessage {
  id: string
  kind: MessageKind
  severity: 'alert' | 'warn' | 'info' | 'ok'
  title: string
  detail: string
  machineId: string | null
  machineName: string | null
  occurredAt: string
}

function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** Nachrichten-Center: Wartungen, Störungen, Dokument-Analysen */
export function useMessageInbox() {
  return useQuery({
    queryKey: ['message-inbox'],
    queryFn: async (): Promise<InboxMessage[]> => {
      const messages: InboxMessage[] = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const in7 = new Date(today)
      in7.setDate(in7.getDate() + 7)

      const machinesRes = await supabase.from('machines').select('id, name, barcode')
      const machines = machinesRes.data ?? []
      const nameById = new Map(machines.map((m) => [m.id, m.name]))
      const ids = machines.map((m) => m.id)
      if (ids.length === 0) return []

      const [tasksRes, ticketsRes, attachmentsRes, draftsRes] = await Promise.all([
        supabase
          .from('maintenance_tasks')
          .select('id, machine_id, title, next_due_date')
          .in('machine_id', ids),
        supabase
          .from('tickets')
          .select('id, machine_id, description, status, created_at')
          .in('machine_id', ids)
          .in('status', ['open', 'in_progress']),
        supabase
          .from('machine_attachments')
          .select(
            'id, machine_id, filename, title, analyzed_at, ai_analysis_status, created_at',
          )
          .in('machine_id', ids),
        supabase
          .from('maintenance_plan_drafts')
          .select('id, machine_id, title, status, created_at, error_message')
          .in('machine_id', ids)
          .in('status', ['draft', 'processing', 'ready', 'failed']),
      ])

      for (const task of tasksRes.data ?? []) {
        if (!task.next_due_date) continue
        const due = new Date(task.next_due_date)
        const machineName = nameById.get(task.machine_id) ?? null
        if (due < today) {
          messages.push({
            id: `maint-overdue-${task.id}`,
            kind: 'maintenance_overdue',
            severity: 'alert',
            title: 'Wartung überfällig',
            detail: `${task.title} · seit ${due.toLocaleDateString('de-DE')}`,
            machineId: task.machine_id,
            machineName,
            occurredAt: task.next_due_date,
          })
        } else if (due <= in7) {
          const d = daysUntil(task.next_due_date)
          messages.push({
            id: `maint-soon-${task.id}`,
            kind: 'maintenance_soon',
            severity: 'warn',
            title: 'Wartung bald fällig',
            detail: `${task.title} · in ${d} Tag${d === 1 ? '' : 'en'}`,
            machineId: task.machine_id,
            machineName,
            occurredAt: task.next_due_date,
          })
        }
      }

      for (const ticket of ticketsRes.data ?? []) {
        messages.push({
          id: `ticket-${ticket.id}`,
          kind: 'ticket_open',
          severity: 'alert',
          title: 'Offene Störung',
          detail: ticket.description.slice(0, 120),
          machineId: ticket.machine_id,
          machineName: nameById.get(ticket.machine_id) ?? null,
          occurredAt: ticket.created_at,
        })
      }

      for (const draft of draftsRes.data ?? []) {
        const machineName = nameById.get(draft.machine_id) ?? null
        if (draft.status === 'ready' || draft.status === 'draft') {
          messages.push({
            id: `plan-${draft.id}`,
            kind: 'plan_ready',
            severity: 'ok',
            title: draft.status === 'ready' ? 'Wartungsplan bereit' : 'Plan-Entwurf',
            detail: draft.title,
            machineId: draft.machine_id,
            machineName,
            occurredAt: draft.created_at,
          })
        } else if (draft.status === 'processing') {
          messages.push({
            id: `plan-proc-${draft.id}`,
            kind: 'plan_processing',
            severity: 'info',
            title: 'Plan-Analyse läuft',
            detail: draft.title,
            machineId: draft.machine_id,
            machineName,
            occurredAt: draft.created_at,
          })
        } else if (draft.status === 'failed') {
          messages.push({
            id: `plan-fail-${draft.id}`,
            kind: 'plan_failed',
            severity: 'alert',
            title: 'Plan-Analyse fehlgeschlagen',
            detail: draft.error_message || draft.title,
            machineId: draft.machine_id,
            machineName,
            occurredAt: draft.created_at,
          })
        }
      }

      for (const att of attachmentsRes.data ?? []) {
        const unanalyzed =
          !att.analyzed_at &&
          att.ai_analysis_status !== 'done' &&
          att.ai_analysis_status !== 'processing'
        if (att.ai_analysis_status === 'failed') {
          messages.push({
            id: `doc-fail-${att.id}`,
            kind: 'plan_failed',
            severity: 'warn',
            title: 'Dokument-Analyse fehlgeschlagen',
            detail: att.title || att.filename,
            machineId: att.machine_id,
            machineName: nameById.get(att.machine_id) ?? null,
            occurredAt: att.created_at,
          })
        } else if (unanalyzed) {
          messages.push({
            id: `doc-pending-${att.id}`,
            kind: 'docs_unanalyzed',
            severity: 'info',
            title: 'Dokument ohne Analyse',
            detail: att.title || att.filename,
            machineId: att.machine_id,
            machineName: nameById.get(att.machine_id) ?? null,
            occurredAt: att.created_at,
          })
        }
      }

      const severityRank = { alert: 0, warn: 1, info: 2, ok: 3 }
      return messages.sort((a, b) => {
        const s = severityRank[a.severity] - severityRank[b.severity]
        if (s !== 0) return s
        return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      })
    },
    refetchInterval: 60_000,
  })
}
