import { useQuery } from '@tanstack/react-query'
import { addDaysIso } from '../lib/maintenanceDue'
import { parseLocation } from '../lib/machineLocationGroups'
import { machineLocationSuggestions } from '../lib/machineLocations'
import {
  EMPTY_MACHINE_OIL_DATES,
  oilDatesSelectFragment,
  pickOilDates,
  type MachineOilDates,
} from '../lib/machineOilDates'
import { supabase } from '../lib/supabase'
import type { MachineStatus } from '../types/database'

export interface MachineWithStats {
  id: string
  barcode: string
  name: string
  /** Anzeigename Zeichnung/Menü – optional */
  label_name: string | null
  location: string | null
  /** Maschine / Gerät / Kran … */
  category: string | null
  warranty_until: string | null
  status: MachineStatus
  external_source: string | null
  created_at: string
  last_maintenance_at: string | null
  next_maintenance_at: string | null
  last_repair_at: string | null
  last_cutting_oil_at: string | null
  next_cutting_oil_at: string | null
  last_hydraulic_oil_at: string | null
  next_hydraulic_oil_at: string | null
  last_maintenance_code: string | null
  next_maintenance_code: string | null
  last_hydraulic_code: string | null
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

function buildSearchHaystack(m: MachineWithStats): string {
  return [
    m.barcode,
    m.name,
    m.label_name ?? '',
    m.location ?? '',
    m.category ?? '',
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

type MachineListRow = {
  id: string
  barcode: string
  name: string
  label_name: string | null
  location: string | null
  category: string | null
  warranty_until: string | null
  status: MachineStatus
  external_source: string | null
  created_at: string
} & Partial<MachineOilDates>

function isMissingColumnError(message: string, column: string): boolean {
  return (
    new RegExp(column, 'i').test(message) &&
    /schema cache|does not exist|could not find|unknown/i.test(message)
  )
}

/** Lädt Maschinen mit Fallback, wenn optionale Spalten in Prod fehlen. */
async function loadMachineListRows(): Promise<{
  machines: MachineListRow[]
  oilColumnsAvailable: boolean
}> {
  const attempts: Array<{ select: string; oil: boolean }> = [
    {
      select: `id, barcode, name, label_name, location, category, warranty_until, status, external_source, created_at, ${oilDatesSelectFragment()}`,
      oil: true,
    },
    {
      select:
        'id, barcode, name, label_name, location, category, warranty_until, status, external_source, created_at',
      oil: false,
    },
    {
      select:
        'id, barcode, name, label_name, location, category, warranty_until, status, created_at',
      oil: false,
    },
    {
      select: 'id, barcode, name, location, category, warranty_until, status, created_at',
      oil: false,
    },
    {
      select: 'id, barcode, name, location, warranty_until, status, created_at',
      oil: false,
    },
  ]

  let lastError: { message: string } | null = null

  for (const attempt of attempts) {
    const res = await supabase.from('machines').select(attempt.select).order('name')
    if (!res.error) {
      const machines = ((res.data ?? []) as unknown as Array<Record<string, unknown>>).map(
        (m) => ({
          id: m.id as string,
          barcode: m.barcode as string,
          name: m.name as string,
          label_name: (m.label_name as string | null | undefined) ?? null,
          location: (m.location as string | null | undefined) ?? null,
          category: (m.category as string | null | undefined) ?? null,
          warranty_until: (m.warranty_until as string | null | undefined) ?? null,
          status: m.status as MachineStatus,
          external_source: (m.external_source as string | null | undefined) ?? null,
          created_at: m.created_at as string,
          ...(attempt.oil ? pickOilDates(m) : {}),
        }),
      )
      return { machines, oilColumnsAvailable: attempt.oil }
    }

    lastError = res.error
    const msg = res.error.message
    const optionalMissing =
      isMissingColumnError(msg, 'external_source') ||
      isMissingColumnError(msg, 'label_name') ||
      isMissingColumnError(msg, 'category') ||
      /cutting_oil|hydraulic_oil|maintenance_code|hydraulic_code/i.test(msg)

    if (!optionalMissing) break
  }

  throw lastError ?? new Error('Maschinen konnten nicht geladen werden')
}

export function useMachinesWithStats() {
  return useQuery({
    queryKey: ['machines-with-stats'],
    queryFn: async () => {
      const { machines, oilColumnsAvailable } = await loadMachineListRows()

      const machinesReady: Array<MachineListRow & MachineOilDates> = machines.map((m) => ({
        ...m,
        ...(oilColumnsAvailable ? pickOilDates(m) : EMPTY_MACHINE_OIL_DATES),
      }))

      if (machinesReady.length === 0) return []

      const ids = machinesReady.map((m) => m.id)

      type LifeRow = {
        machine_id: string
        entry_type: string
        title: string
        description: string | null
        occurred_at: string
        duration_days: number | null
        next_due_date: string | null
      }

      let lifecycleRows: LifeRow[] = []
      const lifecycleFull = await supabase
        .from('machine_lifecycle_entries')
        .select(
          'machine_id, entry_type, title, description, occurred_at, duration_days, next_due_date',
        )
        .in('machine_id', ids)

      if (!lifecycleFull.error) {
        lifecycleRows = (lifecycleFull.data ?? []) as LifeRow[]
      } else {
        const lifecycleBasic = await supabase
          .from('machine_lifecycle_entries')
          .select('machine_id, entry_type, title, description, occurred_at')
          .in('machine_id', ids)
        if (!lifecycleBasic.error) {
          lifecycleRows = (lifecycleBasic.data ?? []).map((e) => ({
            ...e,
            duration_days: null,
            next_due_date: null,
          }))
        }
      }

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

      return machinesReady.map((m) => {
        const taskNextDates = (tasksRes.data ?? [])
          .filter((t) => t.machine_id === m.id)
          .map((t) => t.next_due_date)
          .filter(Boolean) as string[]

        const machineTickets = (ticketsRes.data ?? []).filter((t) => t.machine_id === m.id)
        const openTickets = machineTickets.filter(
          (t) => t.status === 'open' || t.status === 'in_progress',
        )

        const ticketDates = machineTickets.map((t) => t.resolved_at ?? t.created_at)

        const lifecycleMaint = lifecycleRows
          .filter((e) => e.machine_id === m.id && e.entry_type === 'maintenance')
          .slice()
          .sort(
            (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
          )

        const latestLifecycleMaint = lifecycleMaint[0] ?? null

        const lifecycleRepair = lifecycleRows
          .filter((e) => e.machine_id === m.id && e.entry_type === 'repair')
          .map((e) => e.occurred_at)

        const lifecyclePlanned = lifecycleRows.filter(
          (e) =>
            e.machine_id === m.id &&
            (e.entry_type === 'maintenance' || e.entry_type === 'repair'),
        )

        const completionDates = completions
          .filter((c) => taskToMachine.get(c.task_id) === m.id)
          .map((c) => c.completed_at)

        const allMaint = [
          ...completionDates,
          ...lifecycleMaint.map((e) => e.occurred_at),
        ]
        const allRepair = [...ticketDates, ...lifecycleRepair]

        const maxDate = (dates: string[]) => {
          if (dates.length === 0) return null
          return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        }

        const last_maintenance_at = maxDate(allMaint)

        // Nächste Wartung / geplante Reparatur: frühester Termin aus Lebenszyklus + Aufgaben
        const dueCandidates: string[] = []
        for (const e of lifecyclePlanned) {
          if (e.next_due_date) {
            dueCandidates.push(e.next_due_date)
          } else if (e.duration_days && e.duration_days > 0) {
            dueCandidates.push(addDaysIso(e.occurred_at, e.duration_days))
          }
        }
        dueCandidates.push(...taskNextDates)

        // Fallback: nur neuester HU-Eintrag (ältere Logik), falls keine Kandidaten
        if (dueCandidates.length === 0 && latestLifecycleMaint) {
          if (latestLifecycleMaint.next_due_date) {
            dueCandidates.push(latestLifecycleMaint.next_due_date)
          } else if (
            latestLifecycleMaint.duration_days &&
            latestLifecycleMaint.duration_days > 0
          ) {
            dueCandidates.push(
              addDaysIso(
                latestLifecycleMaint.occurred_at,
                latestLifecycleMaint.duration_days,
              ),
            )
          }
        }

        const next_maintenance_at =
          dueCandidates.length > 0 ? dueCandidates.slice().sort()[0] ?? null : null

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
          ...pickOilDates(m),
          last_maintenance_at,
          next_maintenance_at,
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

export type MachineSortBy = 'manual' | 'name' | 'category' | 'location' | 'next_maintenance'

export interface MachineListFilters {
  filter?: MachineDateFilter
  customFrom?: string
  customTo?: string
  searchQuery?: string
  /** Kategorie z.B. Maschine, Gerät, Kran – leer = alle */
  category?: string
  /** Standort / Halle – leer = alle */
  location?: string
}

export function filterMachines(
  machines: MachineWithStats[],
  filterOrOpts: MachineDateFilter | MachineListFilters = 'all',
  customFrom?: string,
  customTo?: string,
  searchQuery?: string,
): MachineWithStats[] {
  const opts: MachineListFilters =
    typeof filterOrOpts === 'string'
      ? { filter: filterOrOpts, customFrom, customTo, searchQuery }
      : filterOrOpts

  const filter = opts.filter ?? 'all'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)
  const in30Days = new Date(today)
  in30Days.setDate(in30Days.getDate() - 30)

  const terms = (opts.searchQuery ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  const categoryFilter = opts.category?.trim() ?? ''
  const locationFilter = opts.location?.trim() ?? ''

  return machines.filter((m) => {
    if (terms.length > 0) {
      const hay = buildSearchHaystack(m)
      if (!terms.every((term) => hay.includes(term))) return false
    }

    if (categoryFilter) {
      if ((m.category ?? '').trim() !== categoryFilter) return false
    }

    if (locationFilter) {
      const loc = (m.location ?? '').trim()
      const { hall } = parseLocation(m.location)
      const needle = locationFilter.toLowerCase()
      const match =
        loc === locationFilter ||
        hall === locationFilter ||
        loc.toLowerCase().includes(needle)
      if (!match) return false
    }

    if (filter === 'open_problems') {
      return m.open_ticket_count > 0
    }

    if (filter === 'all') {
      if (opts.customFrom || opts.customTo) {
        const dates = [
          m.last_maintenance_at,
          m.next_maintenance_at,
          m.last_repair_at,
          m.warranty_until,
        ].filter(Boolean) as string[]
        if (dates.length === 0) return false
        return dates.some((d) => {
          const dt = new Date(d)
          if (opts.customFrom && dt < new Date(opts.customFrom)) return false
          if (opts.customTo && dt > new Date(opts.customTo)) return false
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

export function sortMachines(
  machines: MachineWithStats[],
  sortBy: MachineSortBy,
  descending = false,
): MachineWithStats[] {
  const sorted = sortMachinesAsc(machines, sortBy)
  if (!descending || sortBy === 'manual') return sorted
  return sorted.reverse()
}

function sortMachinesAsc(
  machines: MachineWithStats[],
  sortBy: MachineSortBy,
): MachineWithStats[] {
  if (sortBy === 'manual') return machines
  const list = [...machines]
  const byName = (a: MachineWithStats, b: MachineWithStats) =>
    a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })

  if (sortBy === 'name') return list.sort(byName)

  if (sortBy === 'category') {
    return list.sort((a, b) => {
      const c = (a.category ?? 'ÖÖÖ').localeCompare(b.category ?? 'ÖÖÖ', 'de')
      return c !== 0 ? c : byName(a, b)
    })
  }

  if (sortBy === 'location') {
    return list.sort((a, b) => {
      const la = parseLocation(a.location).hall
      const lb = parseLocation(b.location).hall
      const c = la.localeCompare(lb, 'de')
      return c !== 0 ? c : byName(a, b)
    })
  }

  if (sortBy === 'next_maintenance') {
    return list.sort((a, b) => {
      if (!a.next_maintenance_at && !b.next_maintenance_at) return byName(a, b)
      if (!a.next_maintenance_at) return 1
      if (!b.next_maintenance_at) return -1
      const c =
        new Date(a.next_maintenance_at).getTime() - new Date(b.next_maintenance_at).getTime()
      return c !== 0 ? c : byName(a, b)
    })
  }

  return list
}

/** Eindeutige Standorte / Hallen aus der Liste (Filter) */
export function uniqueMachineLocations(machines: MachineWithStats[]): string[] {
  return machineLocationSuggestions(machines.map((m) => m.location ?? ''))
}

/** Eindeutige Kategorien aus der Liste (+ bekannte Vorgaben) */
export function uniqueMachineCategories(machines: MachineWithStats[]): string[] {
  const set = new Set<string>()
  for (const m of machines) {
    if (m.category?.trim()) set.add(m.category.trim())
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
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
