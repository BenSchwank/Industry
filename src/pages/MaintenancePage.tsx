import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChecklistPanel } from '../components/maintenance/ChecklistPanel'
import { useDeleteMaintenanceTasks } from '../hooks/useDeleteMaintenanceTasks'
import { useQuickCompleteMaintenance } from '../hooks/useQuickCompleteMaintenance'
import { formatDurationDays, maintenanceDueTone } from '../lib/maintenanceDue'
import { supabase } from '../lib/supabase'

interface ActiveTask {
  id: string
  machineId: string
  title: string
  frequency_days: number
  next_due_date: string
  machineName: string
  machineBarcode: string
}

export default function MaintenancePage() {
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const quickComplete = useQuickCompleteMaintenance()
  const deleteTasks = useDeleteMaintenanceTasks()

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

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Reparaturen…</p>
  }

  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-xl font-bold">Reparaturen</h2>
          <p className="text-kwd-muted mt-1 text-sm">
            Größere Arbeiten · <strong>Erledigt</strong> schließt ab · <strong>Entfernen</strong>{' '}
            löscht die Planung. Hauptuntersuchungen gehören in die Maschinenliste.
          </p>
        </header>

        {toast && (
          <p className="bg-kwd-success/15 text-kwd-success border-kwd-success/30 border px-3 py-2 text-sm font-medium">
            {toast}
          </p>
        )}

        {tasks?.length === 0 && (
          <div className="bg-kwd-surface rounded-xl p-6 text-center">
            <p className="text-kwd-muted">Keine Reparatur-Aufgaben geplant.</p>
            <p className="text-kwd-muted mt-2 text-sm">
              In der Maschinenakte unter Lebenszyklus „+ Reparatur“ eintragen. Fällige
              Hauptuntersuchungen siehst du in der Maschinenliste (Spalte „Nächste HU“).
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
    </>
  )
}
