import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChecklistPanel } from '../components/maintenance/ChecklistPanel'
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

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Wartungsplan…</p>
  }

  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        <header>
          <h2 className="text-xl font-bold">Wartungsplaner</h2>
          <p className="text-kwd-muted mt-1 text-sm">
            Gelb = innerhalb 3 Monate · Rot = überfällig · Abschluss setzt die nächste Fälligkeit.
          </p>
        </header>

        {tasks?.length === 0 && (
          <div className="bg-kwd-surface rounded-xl p-6 text-center">
            <p className="text-kwd-muted">Keine Wartungsaufgaben geplant.</p>
            <p className="text-kwd-muted mt-2 text-sm">
              In der Maschinenakte unter Lebenszyklus „+ Wartung“ mit Dauer anlegen – dann erscheint
              die Aufgabe hier.
            </p>
          </div>
        )}

        {tasks?.map((task) => {
          const machine = task.machines as { name: string; barcode: string } | null
          const tone = maintenanceDueTone(task.next_due_date)
          const dueDate = new Date(task.next_due_date)

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
              <p className="text-kwd-primary text-xs font-bold">{machine?.barcode}</p>
              <h3 className="font-bold">{task.title}</h3>
              <p className="text-kwd-muted text-sm">{machine?.name}</p>
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
                className="kwd-btn kwd-btn-primary mt-3 min-h-[44px] w-full"
              >
                Wartung öffnen
              </button>
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
        />
      )}
    </>
  )
}
