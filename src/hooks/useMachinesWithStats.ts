import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { MachineStatus } from '../types/database'

export interface MachineWithStats {
  id: string
  barcode: string
  name: string
  location: string | null
  warranty_until: string | null
  status: MachineStatus
  external_source: string | null
  created_at: string
  last_maintenance_at: string | null
  next_maintenance_at: string | null
  last_repair_at: string | null
  /** Offene Störungen */
  open_ticket_count: number
  /** Hochgeladene Dokumente */
  document_count: number
  /** Davon mit Text-Analyse */
  documents_analyzed: number
  /** Wartungsplan aus Dokument-Analyse */
  plan_status: 'none' | 'processing' | 'ready' | 'draft' | 'failed' | 'analyzed'
  plan_label: string | null
  /** Stichworte aus Störungen & Lebenslauf (für Fehlersuche) */
  problem_texts: string[]
}

function emptyStats(): Pick<
  MachineWithStats,
  | 'last_maintenance_at'
  | 'next_maintenance_at'
  | 'last_repair_at'
  | 'open_ticket_count'
  | 'document_count'
  | 'documents_analyzed'
  | 'plan_status'
  | 'plan_label'
  | 'problem_texts'
> {
  return {
    last_maintenance_at: null,
    next_maintenance_at: null,
    last_repair_at: null,
    open_ticket_count: 0,
    document_count: 0,
    documents_analyzed: 0,
    plan_status: 'none',
    plan_label: null,
    problem_texts: [],
  }
}

function buildSearchHaystack(m: MachineWithStats): string {
  return [
    m.barcode,
    m.name,
    m.location ?? '',
    m.status,
    m.plan_label ?? '',
    ...m.problem_texts,
  ]
    .join(' ')
    .toLowerCase()
}

function resolvePlanStatus(
  drafts: { status: string; title: string }[],
  attachments: {
    analyzed_at: string | null
    analysis_summary: string | null
    ai_analysis_status: string | null
  }[],
): { plan_status: MachineWithStats['plan_status']; plan_label: string | null } {
  const processingDraft = drafts.find((d) => d.status === 'processing')
  if (processingDraft) {
    return {
      plan_status: 'processing',
      plan_label: processingDraft.title || 'Analyse läuft…',
    }
  }
  if (attachments.some((a) => a.ai_analysis_status === 'processing')) {
    return { plan_status: 'processing', plan_label: 'Analyse läuft…' }
  }

  const failedDraft = drafts.find((d) => d.status === 'failed')
  const hasGoodDraft = drafts.some((d) => d.status === 'ready' || d.status === 'draft')
  if (
    (failedDraft || attachments.some((a) => a.ai_analysis_status === 'failed')) &&
    !hasGoodDraft
  ) {
    return {
      plan_status: 'failed',
      plan_label: 'Analyse fehlgeschlagen',
    }
  }

  const ready = drafts.find((d) => d.status === 'ready')
  if (ready) {
    return { plan_status: 'ready', plan_label: ready.title || 'Plan bereit' }
  }

  const draft = drafts.find((d) => d.status === 'draft')
  if (draft) {
    return { plan_status: 'draft', plan_label: draft.title || 'Plan-Entwurf' }
  }

  const analyzed = attachments.find((a) => a.analyzed_at || a.ai_analysis_status === 'done')
  if (analyzed) {
    return {
      plan_status: 'analyzed',
      plan_label: analyzed.analysis_summary
        ? analyzed.analysis_summary.slice(0, 48) +
          (analyzed.analysis_summary.length > 48 ? '…' : '')
        : 'Analyse fertig',
    }
  }

  return { plan_status: 'none', plan_label: null }
}

export function useMachinesWithStats() {
  return useQuery({
    queryKey: ['machines-with-stats'],
    queryFn: async () => {
      const machinesRes = await supabase
        .from('machines')
        .select('id, barcode, name, location, warranty_until, status, external_source, created_at')
        .order('name')

      if (machinesRes.error) {
        const basic = await supabase
          .from('machines')
          .select('id, barcode, name, location, warranty_until, status, created_at')
          .order('name')
        if (basic.error) throw basic.error
        return (basic.data ?? []).map((m) => ({
          ...m,
          external_source: null,
          ...emptyStats(),
        })) satisfies MachineWithStats[]
      }

      const machines = machinesRes.data ?? []
      if (machines.length === 0) return []

      const ids = machines.map((m) => m.id)

      let lifecycleRows: {
        machine_id: string
        entry_type: string
        title: string
        description: string | null
        occurred_at: string
      }[] = []
      const lifecycleRes = await supabase
        .from('machine_lifecycle_entries')
        .select('machine_id, entry_type, title, description, occurred_at')
        .in('machine_id', ids)

      if (!lifecycleRes.error) lifecycleRows = lifecycleRes.data ?? []

      const [tasksRes, ticketsRes, attachmentsRes, draftsRes] = await Promise.all([
        supabase
          .from('maintenance_tasks')
          .select('machine_id, next_due_date')
          .in('machine_id', ids),
        supabase
          .from('tickets')
          .select('machine_id, description, status, created_at, resolved_at')
          .in('machine_id', ids),
        supabase
          .from('machine_attachments')
          .select(
            'machine_id, analyzed_at, analysis_summary, ai_analysis_status',
          )
          .in('machine_id', ids),
        supabase
          .from('maintenance_plan_drafts')
          .select('machine_id, title, status')
          .in('machine_id', ids)
          .in('status', ['draft', 'processing', 'ready', 'failed']),
      ])

      const attachments = attachmentsRes.error ? [] : (attachmentsRes.data ?? [])
      const drafts = draftsRes.error ? [] : (draftsRes.data ?? [])

      const { data: allTasks } = await supabase
        .from('maintenance_tasks')
        .select('id, machine_id')
        .in('machine_id', ids)

      const allTaskIds = (allTasks ?? []).map((t) => t.id)
      let completions: { task_id: string; completed_at: string }[] = []
      if (allTaskIds.length > 0) {
        const { data } = await supabase
          .from('maintenance_completions')
          .select('task_id, completed_at')
          .in('task_id', allTaskIds)
        completions = data ?? []
      }

      const taskToMachine = new Map((allTasks ?? []).map((t) => [t.id, t.machine_id]))

      return machines.map((m) => {
        const nextDates = (tasksRes.data ?? [])
          .filter((t) => t.machine_id === m.id)
          .map((t) => t.next_due_date)
          .filter(Boolean)
          .sort()

        const machineTickets = (ticketsRes.data ?? []).filter((t) => t.machine_id === m.id)
        const openTickets = machineTickets.filter(
          (t) => t.status === 'open' || t.status === 'in_progress',
        )

        const ticketDates = machineTickets.map((t) => t.resolved_at ?? t.created_at)

        const lifecycleMaint = lifecycleRows
          .filter((e) => e.machine_id === m.id && e.entry_type === 'maintenance')
          .map((e) => e.occurred_at)

        const lifecycleRepair = lifecycleRows
          .filter((e) => e.machine_id === m.id && e.entry_type === 'repair')
          .map((e) => e.occurred_at)

        const completionDates = completions
          .filter((c) => taskToMachine.get(c.task_id) === m.id)
          .map((c) => c.completed_at)

        const allMaint = [...completionDates, ...lifecycleMaint]
        const allRepair = [...ticketDates, ...lifecycleRepair]

        const maxDate = (dates: string[]) => {
          if (dates.length === 0) return null
          return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        }

        const machineAttachments = attachments.filter((a) => a.machine_id === m.id)
        const machineDrafts = drafts.filter((d) => d.machine_id === m.id)
        const { plan_status, plan_label } = resolvePlanStatus(machineDrafts, machineAttachments)

        const problem_texts = [
          ...openTickets.map((t) => t.description),
          ...machineTickets.slice(0, 8).map((t) => t.description),
          ...lifecycleRows
            .filter((e) => e.machine_id === m.id)
            .map((e) => `${e.title} ${e.description ?? ''}`.trim()),
        ].filter(Boolean)

        return {
          ...m,
          last_maintenance_at: maxDate(allMaint),
          next_maintenance_at: nextDates[0] ?? null,
          last_repair_at: maxDate(allRepair),
          open_ticket_count: openTickets.length,
          document_count: machineAttachments.length,
          documents_analyzed: machineAttachments.filter(
            (a) => a.analyzed_at || a.ai_analysis_status === 'done',
          ).length,
          plan_status,
          plan_label,
          problem_texts,
        } satisfies MachineWithStats
      })
    },
  })
}

export type MachineDateFilter =
  | 'all'
  | 'maintenance_overdue'
  | 'maintenance_due_soon'
  | 'warranty_expired'
  | 'repair_recent'
  | 'open_problems'

export function filterMachines(
  machines: MachineWithStats[],
  filter: MachineDateFilter,
  customFrom?: string,
  customTo?: string,
  searchQuery?: string,
): MachineWithStats[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)
  const in30Days = new Date(today)
  in30Days.setDate(in30Days.getDate() - 30)

  const terms = (searchQuery ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return machines.filter((m) => {
    if (terms.length > 0) {
      const hay = buildSearchHaystack(m)
      if (!terms.every((term) => hay.includes(term))) return false
    }

    if (filter === 'open_problems') {
      return m.open_ticket_count > 0
    }

    if (filter === 'all') {
      if (customFrom || customTo) {
        const dates = [
          m.last_maintenance_at,
          m.next_maintenance_at,
          m.last_repair_at,
          m.warranty_until,
        ].filter(Boolean) as string[]
        if (dates.length === 0) return false
        return dates.some((d) => {
          const dt = new Date(d)
          if (customFrom && dt < new Date(customFrom)) return false
          if (customTo && dt > new Date(customTo)) return false
          return true
        })
      }
      return true
    }

    if (filter === 'maintenance_overdue') {
      return m.next_maintenance_at ? new Date(m.next_maintenance_at) < today : false
    }
    if (filter === 'maintenance_due_soon') {
      if (!m.next_maintenance_at) return false
      const d = new Date(m.next_maintenance_at)
      return d >= today && d <= in7Days
    }
    if (filter === 'warranty_expired') {
      return m.warranty_until ? new Date(m.warranty_until) < today : false
    }
    if (filter === 'repair_recent') {
      return m.last_repair_at ? new Date(m.last_repair_at) >= in30Days : false
    }
    return true
  })
}

/** Treffertext für Fehlersuche (welcher Problemtext matched) */
export function matchProblemSnippet(machine: MachineWithStats, searchQuery: string): string | null {
  const terms = searchQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) return null

  for (const text of machine.problem_texts) {
    const lower = text.toLowerCase()
    if (terms.every((t) => lower.includes(t))) {
      return text.length > 80 ? `${text.slice(0, 77)}…` : text
    }
  }
  return null
}
