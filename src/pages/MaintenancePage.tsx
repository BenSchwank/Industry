import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChecklistPanel } from '../components/maintenance/ChecklistPanel'
import { MaintenanceTaskCard } from '../components/maintenance/MaintenanceTaskCard'
import { PlannedRepairForm } from '../components/maintenance/PlannedRepairForm'
import {
  RepairTaskEditForm,
  type RepairTaskEditTarget,
} from '../components/maintenance/RepairTaskEditForm'
import { TicketEditForm } from '../components/tickets/TicketEditForm'
import { TICKET_STATUS_LABEL, useResolveTicket } from '../hooks/useTicketActions'
import { useDeleteMaintenanceTasks } from '../hooks/useDeleteMaintenanceTasks'
import { useQuickCompleteMaintenance } from '../hooks/useQuickCompleteMaintenance'
import { maintenanceDueTone } from '../lib/maintenanceDue'
import { isHuTaskTitle, type MaintenanceSectionFilter } from '../lib/maintenanceTaskType'
import { isPlannedRepairTicket, stripPlannedRepairMarker } from '../lib/plannedRepairTicket'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

interface ActiveTask {
  id: string
  machineId: string
  title: string
  frequency_days: number
  next_due_date: string
  machineName: string
  machineBarcode: string
}

interface LinkedTicketRow {
  id: string
  description: string
  status: string
  priority: string
  created_at: string
  machine_id: string | null
  lifecycle_entry_id: string | null
  assigned_to?: string | null
  reference_label?: string | null
  machines: { name: string; barcode: string } | null
  machine_lifecycle_entries: {
    id: string
    entry_type: string
    title: string
    next_due_date: string | null
    occurred_at: string
  } | null
}

const ENTRY_TYPE_LABEL: Record<string, string> = {
  repair: 'Reparatur',
  maintenance: 'Wartung',
  inspection: 'Inspektion',
  note: 'Notiz',
}

const LINK_SQL_HINT =
  'Verknüpfte Störungen brauchen: supabase/FIX_TICKET_LIFECYCLE_LINK.sql in Supabase ausführen.'

interface FreeRepairRow {
  id: string
  description: string
  status: string
  priority: string
  created_at: string
  assigned_to?: string | null
  reference_label?: string | null
  kind?: string | null
}

const SECTION_FILTERS: { id: MaintenanceSectionFilter; label: string }[] = [
  { id: 'all', label: 'Alles' },
  { id: 'hu', label: 'Wartung / HU' },
  { id: 'repair', label: 'Mit Termin' },
  { id: 'open', label: 'Ohne Termin' },
  { id: 'linked', label: 'Verknüpft' },
]

export default function MaintenancePage() {
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sectionFilter, setSectionFilter] = useState<MaintenanceSectionFilter>('all')
  const [showPlannedRepair, setShowPlannedRepair] = useState(false)
  const [editTask, setEditTask] = useState<RepairTaskEditTarget | null>(null)
  const [editTicket, setEditTicket] = useState<import('../components/tickets/TicketEditForm').TicketEditTarget | null>(
    null,
  )
  const quickComplete = useQuickCompleteMaintenance()
  const deleteTasks = useDeleteMaintenanceTasks()
  const resolveTicket = useResolveTicket()
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setSelectedMachineId = useAppStore((s) => s.setSelectedMachineId)

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['maintenance-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('id, title, frequency_days, next_due_date, machine_id, machines(name, barcode)')
        .order('next_due_date')
      if (error) throw error
      return data
    },
  })

  /** Offene Störungen, die mit Wartung / geplanter Reparatur verknüpft sind */
  const { data: linkedData } = useQuery({
    queryKey: ['maintenance-linked-tickets'],
    queryFn: async (): Promise<{ tickets: LinkedTicketRow[]; hint: string | null }> => {
      // Zuerst ohne Lifecycle-Embed (PostgREST-Join scheitert sonst still → leere Liste)
      const full = await supabase
        .from('tickets')
        .select(
          'id, description, status, priority, created_at, machine_id, lifecycle_entry_id, assigned_to, reference_label, machines(name, barcode)',
        )
        .in('status', ['open', 'in_progress'])
        .not('lifecycle_entry_id', 'is', null)
        .order('created_at', { ascending: false })

      let rows: Array<{
        id: string
        description: string
        status: string
        priority: string
        created_at: string
        machine_id: string | null
        lifecycle_entry_id: string | null
        assigned_to?: string | null
        reference_label?: string | null
        machines: { name: string; barcode: string } | null
      }> = []

      if (!full.error) {
        rows = (full.data ?? []) as typeof rows
      } else if (/lifecycle_entry_id|schema cache/i.test(full.error.message)) {
        return { tickets: [], hint: LINK_SQL_HINT }
      } else if (/machines|schema cache/i.test(full.error.message)) {
        const bare = await supabase
          .from('tickets')
          .select(
            'id, description, status, priority, created_at, machine_id, lifecycle_entry_id, assigned_to, reference_label',
          )
          .in('status', ['open', 'in_progress'])
          .not('lifecycle_entry_id', 'is', null)
          .order('created_at', { ascending: false })
        if (bare.error) {
          if (/lifecycle_entry_id|schema cache/i.test(bare.error.message)) {
            return { tickets: [], hint: LINK_SQL_HINT }
          }
          throw bare.error
        }
        rows = (bare.data ?? []).map((r) => ({
          ...r,
          machines: null,
        })) as typeof rows
      } else {
        throw full.error
      }

      const entryIds = [
        ...new Set(rows.map((r) => r.lifecycle_entry_id).filter((id): id is string => Boolean(id))),
      ]

      const entryMap = new Map<
        string,
        {
          id: string
          entry_type: string
          title: string
          next_due_date: string | null
          occurred_at: string
        }
      >()

      if (entryIds.length > 0) {
        const entriesRes = await supabase
          .from('machine_lifecycle_entries')
          .select('id, entry_type, title, next_due_date, occurred_at')
          .in('id', entryIds)

        if (!entriesRes.error) {
          for (const e of entriesRes.data ?? []) {
            entryMap.set(e.id, {
              id: e.id,
              entry_type: e.entry_type,
              title: e.title,
              next_due_date: (e as { next_due_date?: string | null }).next_due_date ?? null,
              occurred_at: e.occurred_at,
            })
          }
        } else if (/next_due_date|schema cache/i.test(entriesRes.error.message)) {
          const basic = await supabase
            .from('machine_lifecycle_entries')
            .select('id, entry_type, title, occurred_at')
            .in('id', entryIds)
          if (!basic.error) {
            for (const e of basic.data ?? []) {
              entryMap.set(e.id, {
                id: e.id,
                entry_type: e.entry_type,
                title: e.title,
                next_due_date: null,
                occurred_at: e.occurred_at,
              })
            }
          }
        }
      }

      return {
        hint: null,
        tickets: rows.map((r) => ({
          ...r,
          machine_lifecycle_entries: r.lifecycle_entry_id
            ? (entryMap.get(r.lifecycle_entry_id) ?? null)
            : null,
        })),
      }
    },
  })

  const linkedTickets = linkedData?.tickets ?? []
  const linkHint = linkedData?.hint ?? null

  /** Nur geplante Reparaturen ohne Maschine (eigener Bezugspunkt) */
  const { data: freeRepairs = [] } = useQuery({
    queryKey: ['maintenance-free-repairs'],
    queryFn: async (): Promise<FreeRepairRow[]> => {
      const full = await supabase
        .from('tickets')
        .select('id, description, status, priority, created_at, assigned_to, reference_label, kind')
        .is('machine_id', null)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })

      if (!full.error) {
        return ((full.data ?? []) as FreeRepairRow[]).filter((t) =>
          isPlannedRepairTicket({ kind: t.kind, description: t.description }),
        )
      }

      if (/\bkind\b|schema cache/i.test(full.error.message)) {
        const fb = await supabase
          .from('tickets')
          .select('id, description, status, priority, created_at, assigned_to, reference_label')
          .is('machine_id', null)
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false })
        if (fb.error) throw fb.error
        return ((fb.data ?? []) as FreeRepairRow[]).filter((t) =>
          isPlannedRepairTicket({ description: t.description }),
        )
      }
      throw full.error
    },
  })

  const taskList = useMemo(() => {
    const rows = (tasks ?? []).map((t) => ({
      ...t,
      machines: t.machines as { name: string; barcode: string } | null,
    }))
    type Dated = (typeof rows)[number] & { next_due_date: string }
    const withDue = (t: (typeof rows)[number]): t is Dated => Boolean(t.next_due_date)
    return {
      hu: rows.filter((t): t is Dated => isHuTaskTitle(t.title) && withDue(t)),
      // Erledigte Reparaturen ohne Termin nicht mehr in der Liste
      repair: rows.filter((t): t is Dated => !isHuTaskTitle(t.title) && withDue(t)),
    }
  }, [tasks])

  const openEndedLinked = useMemo(
    () =>
      linkedTickets.filter((t) => {
        const due = t.machine_lifecycle_entries?.next_due_date
        return !due
      }),
    [linkedTickets],
  )

  const linkedWithDue = useMemo(
    () =>
      linkedTickets.filter((t) => Boolean(t.machine_lifecycle_entries?.next_due_date)),
    [linkedTickets],
  )

  const showHu = sectionFilter === 'all' || sectionFilter === 'hu'
  const showRepairDated = sectionFilter === 'all' || sectionFilter === 'repair'
  const showOpen = sectionFilter === 'all' || sectionFilter === 'open'
  const showLinked = sectionFilter === 'all' || sectionFilter === 'linked'

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3500)
  }

  async function handleQuickDone(task: {
    id: string
    machine_id: string
    title: string
    frequency_days: number
    machines: { name: string; barcode: string } | null
  }) {
    setBusyId(task.id)
    try {
      const result = await quickComplete.mutateAsync({
        machineId: task.machine_id,
        taskId: task.id,
        taskTitle: task.title,
        frequencyDays: task.frequency_days,
      })
      flash(
        result.entryType === 'repair'
          ? `Reparatur erledigt · als letzte Reparatur gespeichert`
          : `HU erledigt · nächste: ${
              result.nextDueDate
                ? new Date(result.nextDueDate).toLocaleDateString('de-DE')
                : '—'
            }`,
      )
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Abschluss fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(task: {
    id: string
    title: string
    machines: { name: string; barcode: string } | null
  }) {
    const name = task.machines?.name ?? 'Unbekannt'
    if (
      !window.confirm(
        `Aufgabe „${task.title}“ für „${name}“ wirklich entfernen?\n\nKein Abschluss – die Planung verschwindet dauerhaft.`,
      )
    ) {
      return
    }
    setBusyId(task.id)
    try {
      await deleteTasks.mutateAsync([task.id])
      if (activeTask?.id === task.id) setActiveTask(null)
      flash('Aufgabe entfernt')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  async function handleResolveLinked(ticketId: string) {
    setBusyId(ticketId)
    try {
      await resolveTicket.mutateAsync(ticketId)
      flash('Störung als erledigt markiert')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erledigen fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  function openMachine(machineId: string | null) {
    if (!machineId) {
      setActiveView('tickets')
      return
    }
    setSelectedMachineId(machineId)
    setActiveView('machines')
  }

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Reparaturen…</p>
  }

  return (
    <>
      <div className="flex flex-col gap-4 p-4 pb-24">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Reparaturen</h2>
            <p className="text-kwd-muted mt-1 text-sm">
              Getrennt: Wartung/HU · geplante Reparaturen mit Termin · ohne Termin · verknüpfte
              Meldungen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPlannedRepair(true)}
            className="kwd-btn kwd-btn-primary min-h-[44px] shrink-0 px-4 font-bold"
          >
            + Geplante Reparatur
          </button>
        </header>

        <div className="flex flex-wrap gap-2">
          {SECTION_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSectionFilter(f.id)}
              className={`min-h-[40px] rounded-xl border px-3 text-sm font-semibold ${
                sectionFilter === f.id
                  ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                  : 'border-kwd-border bg-kwd-surface text-kwd-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {toast && (
          <p className="bg-kwd-success/15 text-kwd-success border-kwd-success/30 border px-3 py-2 text-sm font-medium">
            {toast}
          </p>
        )}

        {tasks?.length === 0 && freeRepairs.length === 0 && linkedTickets.length === 0 && (
          <div className="bg-kwd-surface rounded-xl p-6 text-center">
            <p className="text-kwd-muted">Keine Reparatur- oder Wartungs-Termine geplant.</p>
            <p className="text-kwd-muted mt-2 text-sm">
              Mit „+ Geplante Reparatur“ anlegen oder unter Störungen „Nach Reparaturen“ nutzen.
            </p>
          </div>
        )}

        {showHu && taskList.hu.length > 0 && (
          <section className="flex flex-col gap-3">
            <header>
              <h3 className="text-sm font-bold tracking-wide uppercase">Wartung / HU</h3>
              <p className="text-kwd-muted text-xs">Hauptuntersuchungen mit Intervall und Fälligkeit.</p>
            </header>
            {taskList.hu.map((task) => (
              <MaintenanceTaskCard
                key={task.id}
                task={task}
                busy={busyId === task.id}
                deletePending={deleteTasks.isPending}
                completePending={quickComplete.isPending}
                onComplete={() =>
                  void handleQuickDone({
                    id: task.id,
                    machine_id: task.machine_id,
                    title: task.title,
                    frequency_days: task.frequency_days,
                    machines: task.machines,
                  })
                }
                onEdit={() =>
                  setEditTask({
                    id: task.id,
                    machineId: task.machine_id,
                    title: task.title,
                    next_due_date: task.next_due_date,
                    isHu: true,
                    machineLabel: task.machines
                      ? `${task.machines.barcode} – ${task.machines.name}`
                      : undefined,
                  })
                }
                onDetails={() =>
                  setActiveTask({
                    id: task.id,
                    machineId: task.machine_id,
                    title: task.title,
                    frequency_days: task.frequency_days,
                    next_due_date: task.next_due_date,
                    machineName: task.machines?.name ?? 'Unbekannt',
                    machineBarcode: task.machines?.barcode ?? '',
                  })
                }
                onDelete={() =>
                  void handleDelete({
                    id: task.id,
                    title: task.title,
                    machines: task.machines,
                  })
                }
              />
            ))}
          </section>
        )}

        {showRepairDated && taskList.repair.length > 0 && (
          <section className="flex flex-col gap-3">
            <header className={sectionFilter === 'all' ? 'border-kwd-border border-t pt-4' : undefined}>
              <h3 className="text-sm font-bold tracking-wide uppercase">
                Geplante Reparaturen (mit Termin)
              </h3>
              <p className="text-kwd-muted text-xs">Nur das geplante Datum – kein Wartungsintervall.</p>
            </header>
            {taskList.repair.map((task) => (
              <MaintenanceTaskCard
                key={task.id}
                task={task}
                busy={busyId === task.id}
                deletePending={deleteTasks.isPending}
                completePending={quickComplete.isPending}
                onComplete={() =>
                  void handleQuickDone({
                    id: task.id,
                    machine_id: task.machine_id,
                    title: task.title,
                    frequency_days: task.frequency_days,
                    machines: task.machines,
                  })
                }
                onEdit={() =>
                  setEditTask({
                    id: task.id,
                    machineId: task.machine_id,
                    title: task.title,
                    next_due_date: task.next_due_date,
                    isHu: false,
                    machineLabel: task.machines
                      ? `${task.machines.barcode} – ${task.machines.name}`
                      : undefined,
                  })
                }
                onDetails={() =>
                  setActiveTask({
                    id: task.id,
                    machineId: task.machine_id,
                    title: task.title,
                    frequency_days: task.frequency_days,
                    next_due_date: task.next_due_date,
                    machineName: task.machines?.name ?? 'Unbekannt',
                    machineBarcode: task.machines?.barcode ?? '',
                  })
                }
                onDelete={() =>
                  void handleDelete({
                    id: task.id,
                    title: task.title,
                    machines: task.machines,
                  })
                }
              />
            ))}
          </section>
        )}

        {showOpen && (freeRepairs.length > 0 || openEndedLinked.length > 0) && (
          <section className="mt-2 flex flex-col gap-3">
            <header className="border-kwd-border border-t pt-4">
              <h3 className="text-sm font-bold tracking-wide uppercase">
                Geplante Reparaturen (ohne Termin)
              </h3>
              <p className="text-kwd-muted mt-1 text-xs">
                Offen ohne Anlauffrist – Bezugspunkt oder Maschine.
              </p>
            </header>

            {freeRepairs.map((t) => {
              const busy = busyId === t.id
              const label = t.reference_label?.trim() || 'Bezugspunkt'
              const displayDesc = stripPlannedRepairMarker(t.description)
              return (
                <article
                  key={t.id}
                  className="border-kwd-border bg-kwd-surface rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-kwd-primary text-xs font-bold">Eigener Bezug</p>
                      <h3 className="font-bold">{label}</h3>
                      <p className="text-kwd-muted mt-1 line-clamp-4 whitespace-pre-wrap text-sm">
                        {displayDesc}
                      </p>
                    </div>
                    <span className="bg-kwd-bg shrink-0 rounded px-2 py-1 text-xs font-medium">
                      {TICKET_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="kwd-btn min-h-[44px] px-3 text-sm font-semibold"
                      disabled={busy}
                      onClick={() =>
                        setEditTicket({
                          id: t.id,
                          description: t.description,
                          priority: t.priority as import('../types/database').TicketPriority,
                          status: t.status as import('../types/database').TicketStatus,
                          assigned_to: t.assigned_to ?? null,
                          machine_id: null,
                          reference_label: t.reference_label ?? null,
                          machine_label: label,
                          kind: t.kind ?? 'planned_repair',
                        })
                      }
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="bg-kwd-success min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold text-white disabled:opacity-50"
                      onClick={() => void handleResolveLinked(t.id)}
                    >
                      {busy ? '…' : 'Erledigt'}
                    </button>
                  </div>
                </article>
              )
            })}

            {openEndedLinked.map((t) => {
              const machine = t.machines
              const entry = t.machine_lifecycle_entries
              const busy = busyId === t.id
              const typeLabel = entry
                ? (ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type)
                : 'Lebenszyklus'
              return (
                <article
                  key={`open-${t.id}`}
                  className="border-kwd-border bg-kwd-surface rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-kwd-primary text-xs font-bold">
                        {machine?.barcode ?? '–'} · ohne Termin
                      </p>
                      <h3 className="font-bold">{machine?.name ?? 'Bezug ohne Maschine'}</h3>
                      <p className="text-kwd-muted mt-1 line-clamp-3 text-sm">{t.description}</p>
                      {entry && (
                        <p className="text-kwd-primary mt-2 text-xs font-semibold">
                          Verknüpft: {typeLabel} · {entry.title} · ohne festen Termin
                        </p>
                      )}
                    </div>
                    <span className="bg-kwd-bg shrink-0 rounded px-2 py-1 text-xs font-medium">
                      {TICKET_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="kwd-btn min-h-[44px] px-3 text-sm font-semibold"
                      disabled={busy}
                      onClick={() =>
                        setEditTicket({
                          id: t.id,
                          description: t.description,
                          priority: t.priority as import('../types/database').TicketPriority,
                          status: t.status as import('../types/database').TicketStatus,
                          assigned_to: t.assigned_to ?? null,
                          machine_id: t.machine_id,
                          reference_label: t.reference_label ?? null,
                          machine_label: machine
                            ? `${machine.barcode} – ${machine.name}`
                            : undefined,
                          lifecycle_entry_id: t.lifecycle_entry_id,
                          planned_due_date: null,
                          kind: 'planned_repair',
                        })
                      }
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="kwd-btn min-h-[44px] flex-1 text-sm font-semibold"
                      onClick={() => openMachine(t.machine_id)}
                    >
                      {t.machine_id ? 'Zur Maschine' : 'Zu Störungen'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="bg-kwd-success min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold text-white disabled:opacity-50"
                      onClick={() => void handleResolveLinked(t.id)}
                    >
                      {busy ? '…' : 'Erledigt'}
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
        )}

        {showLinked && (linkedWithDue.length > 0 || linkHint) && (
          <section className="mt-2 flex flex-col gap-3">
            <header className="border-kwd-border border-t pt-4">
              <h3 className="text-sm font-bold tracking-wide uppercase">
                Verknüpfte Meldungen
              </h3>
              <p className="text-kwd-muted mt-1 text-xs">
                Offene Meldungen mit Bezug zu Wartung oder geplanter Reparatur.
              </p>
            </header>

            {linkHint && (
              <p className="text-kwd-warning rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium">
                {linkHint}
              </p>
            )}

            {linkedWithDue.map((t) => {
              const machine = t.machines
              const entry = t.machine_lifecycle_entries
              const busy = busyId === t.id
              const due = entry?.next_due_date
              const tone = due ? maintenanceDueTone(due) : 'ok'
              const typeLabel = entry
                ? (ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type)
                : 'Lebenszyklus'

              return (
                <article
                  key={t.id}
                  className={`rounded-xl border p-4 ${
                    tone === 'overdue'
                      ? 'border-kwd-danger/40 bg-kwd-danger/5'
                      : 'border-kwd-border bg-kwd-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-kwd-primary text-xs font-bold">
                        {machine?.barcode ?? '–'} · verknüpft
                      </p>
                      <h3 className="font-bold">{machine?.name ?? 'Bezug ohne Maschine'}</h3>
                      <p className="text-kwd-muted mt-1 line-clamp-3 text-sm">{t.description}</p>
                    </div>
                    <span className="bg-kwd-bg shrink-0 rounded px-2 py-1 text-xs font-medium">
                      {TICKET_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>

                  {entry && (
                    <p className="text-kwd-primary mt-2 text-xs font-semibold">
                      Verknüpft: {typeLabel} · {entry.title}
                      {due
                        ? ` · Termin ${new Date(due).toLocaleDateString('de-DE')}`
                        : ' · ohne festen Termin'}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="kwd-btn min-h-[44px] px-3 text-sm font-semibold"
                      disabled={busy}
                      onClick={() =>
                        setEditTicket({
                          id: t.id,
                          description: t.description,
                          priority: t.priority as import('../types/database').TicketPriority,
                          status: t.status as import('../types/database').TicketStatus,
                          assigned_to: t.assigned_to ?? null,
                          machine_id: t.machine_id,
                          reference_label: t.reference_label ?? null,
                          machine_label: machine
                            ? `${machine.barcode} – ${machine.name}`
                            : undefined,
                          lifecycle_entry_id: t.lifecycle_entry_id,
                          planned_due_date: entry?.next_due_date ?? null,
                          kind: 'planned_repair',
                        })
                      }
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="kwd-btn min-h-[44px] flex-1 text-sm font-semibold"
                      onClick={() => openMachine(t.machine_id)}
                    >
                      {t.machine_id ? 'Zur Maschine' : 'Zu Störungen'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="bg-kwd-success min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold text-white disabled:opacity-50"
                      onClick={() => void handleResolveLinked(t.id)}
                    >
                      {busy ? '…' : 'Erledigt'}
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>

      {activeTask && (
        <ChecklistPanel
          taskId={activeTask.id}
          machineId={activeTask.machineId}
          taskTitle={activeTask.title}
          machineName={activeTask.machineName}
          machineBarcode={activeTask.machineBarcode}
          frequencyDays={activeTask.frequency_days}
          nextDueDate={activeTask.next_due_date}
          onClose={() => setActiveTask(null)}
          onDeleted={() => {
            setActiveTask(null)
            flash('Aufgabe entfernt')
          }}
        />
      )}

      {editTicket && (
        <TicketEditForm
          ticket={editTicket}
          onClose={() => setEditTicket(null)}
          onSuccess={(msg) => flash(msg)}
        />
      )}

      {editTask && (
        <RepairTaskEditForm
          task={editTask}
          onClose={() => setEditTask(null)}
          onSuccess={(msg) => flash(msg)}
        />
      )}

      {showPlannedRepair && (
        <PlannedRepairForm
          onClose={() => setShowPlannedRepair(false)}
          onSuccess={(msg) => flash(msg)}
        />
      )}
    </>
  )
}
