import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChecklistPanel } from '../components/maintenance/ChecklistPanel'
import { TicketEditForm } from '../components/tickets/TicketEditForm'
import { TICKET_STATUS_LABEL, useResolveTicket } from '../hooks/useTicketActions'
import { useDeleteMaintenanceTasks } from '../hooks/useDeleteMaintenanceTasks'
import { useQuickCompleteMaintenance } from '../hooks/useQuickCompleteMaintenance'
import { formatDurationDays, maintenanceDueTone } from '../lib/maintenanceDue'
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

export default function MaintenancePage() {
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
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
        `Erledigt · nächste: ${new Date(result.nextDueDate).toLocaleDateString('de-DE')}`,
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
        <header>
          <h2 className="text-xl font-bold">Reparaturen</h2>
          <p className="text-kwd-muted mt-1 text-sm">
            Monteur-Termine und geplante Arbeiten · darunter Störungen, die mit Wartung oder geplanter
            Reparatur verknüpft sind.
          </p>
        </header>

        {toast && (
          <p className="bg-kwd-success/15 text-kwd-success border-kwd-success/30 border px-3 py-2 text-sm font-medium">
            {toast}
          </p>
        )}

        {tasks?.length === 0 && (
          <div className="bg-kwd-surface rounded-xl p-6 text-center">
            <p className="text-kwd-muted">Keine Reparatur- oder Wartungs-Termine geplant.</p>
            <p className="text-kwd-muted mt-2 text-sm">
              In der Maschinenakte unter Lebenszyklus „+ Reparatur“ mit Monteur-Termin oder „+
              Hauptuntersuchung“ eintragen.
            </p>
          </div>
        )}

        {tasks?.map((task) => {
          const machine = task.machines as { name: string; barcode: string } | null
          const tone = maintenanceDueTone(task.next_due_date)
          const dueDate = new Date(task.next_due_date)
          const busy = busyId === task.id

          return (
            <article
              key={task.id}
              className={`rounded-xl p-4 ${
                tone === 'overdue'
                  ? 'border-kwd-danger bg-kwd-danger/10 border-2'
                  : tone === 'soon'
                    ? 'border-kwd-warning bg-kwd-warning/10 border-2'
                    : 'bg-kwd-surface border-kwd-border border'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-kwd-primary text-xs font-bold">{machine?.barcode}</p>
                  <h3 className="font-bold">{task.title}</h3>
                  <p className="text-kwd-muted text-sm">{machine?.name}</p>
                </div>
                <button
                  type="button"
                  disabled={busy || deleteTasks.isPending}
                  onClick={() =>
                    void handleDelete({
                      id: task.id,
                      title: task.title,
                      machines: machine,
                    })
                  }
                  className="kwd-btn kwd-btn-danger shrink-0 px-2 text-xs"
                  title="Aufgabe entfernen (ohne Abschluss)"
                >
                  Entfernen
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span
                  className={
                    tone === 'overdue'
                      ? 'text-kwd-danger font-semibold'
                      : tone === 'soon'
                        ? 'text-kwd-warning font-semibold'
                        : ''
                  }
                >
                  Nächste: {dueDate.toLocaleDateString('de-DE')}
                  {tone === 'overdue' && ' · überfällig'}
                  {tone === 'soon' && ' · bald'}
                </span>
                <span className="text-kwd-muted">Dauer: {formatDurationDays(task.frequency_days)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || quickComplete.isPending}
                  onClick={() =>
                    void handleQuickDone({
                      id: task.id,
                      machine_id: task.machine_id,
                      title: task.title,
                      frequency_days: task.frequency_days,
                      machines: machine,
                    })
                  }
                  className="kwd-btn kwd-btn-primary min-h-[44px] flex-1"
                >
                  {busy ? 'Speichern…' : 'Erledigt'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveTask({
                      id: task.id,
                      machineId: task.machine_id,
                      title: task.title,
                      frequency_days: task.frequency_days,
                      next_due_date: task.next_due_date,
                      machineName: machine?.name ?? 'Unbekannt',
                      machineBarcode: machine?.barcode ?? '',
                    })
                  }
                  className="kwd-btn min-h-[44px] flex-1"
                >
                  Details
                </button>
              </div>
            </article>
          )
        })}

        {/* Unten: Störungen mit Verknüpfung Wartung / geplante Reparatur */}
        <section className="mt-2 flex flex-col gap-3">
          <header className="border-kwd-border border-t pt-4">
            <h3 className="text-sm font-bold tracking-wide uppercase">
              Störungen zu Wartung / Reparatur
            </h3>
            <p className="text-kwd-muted mt-1 text-xs">
              Offene Meldungen, die mit Wartung oder geplanter Reparatur verknüpft sind – auch ohne
              festen Monteur-Termin.
            </p>
          </header>

          {linkHint && (
            <p className="text-kwd-warning rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium">
              {linkHint}
            </p>
          )}

          {linkedTickets.length === 0 && !linkHint && (
            <p className="text-kwd-muted bg-kwd-surface rounded-xl px-4 py-5 text-center text-sm">
              Keine verknüpften Störungen. Beim Melden „Wartung / Reparatur“ wählen oder unter
              Störungen „Nach Reparaturen“ nutzen.
            </p>
          )}

          {linkedTickets.map((t) => {
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
                      {machine?.barcode ?? '–'} · Störung
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
                      ? ` · Monteur/Fällig ${new Date(due).toLocaleDateString('de-DE')}`
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
    </>
  )
}
