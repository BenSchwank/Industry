import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChecklistPanel } from '../components/maintenance/ChecklistPanel'
import { supabase } from '../lib/supabase'

interface ActiveTask {
  id: string
  title: string
  frequency_days: number
  machineName: string
}

export default function MaintenancePage() {
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['maintenance-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('id, title, frequency_days, next_due_date, machines(name, barcode)')
        .order('next_due_date')
      if (error) throw error
      return data
    },
  })

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Wartungsplan…</p>
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-xl font-bold">Wartungsplaner</h2>

        {tasks?.length === 0 && (
          <div className="bg-kwd-surface rounded-xl p-6 text-center">
            <p className="text-kwd-muted">Keine Wartungsaufgaben geplant.</p>
            <p className="text-kwd-muted mt-2 text-sm">
              Migration 003 legt eine Beispiel-Checkliste für MCH-001 an.
            </p>
          </div>
        )}

        {tasks?.map((task) => {
          const machine = task.machines as { name: string; barcode: string } | null
          const dueDate = new Date(task.next_due_date)
          const isOverdue = dueDate < today
          const isDueSoon =
            !isOverdue && dueDate.getTime() - today.getTime() <= 7 * 24 * 60 * 60 * 1000

          return (
            <article
              key={task.id}
              className={`rounded-xl p-4 ${
                isOverdue
                  ? 'border-kwd-danger bg-kwd-danger/10 border-2'
                  : isDueSoon
                    ? 'border-kwd-warning bg-kwd-warning/10 border-2'
                    : 'bg-kwd-surface'
              }`}
            >
              <p className="text-kwd-primary text-xs font-bold">{machine?.barcode}</p>
              <h3 className="font-bold">{task.title}</h3>
              <p className="text-kwd-muted text-sm">{machine?.name}</p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span>Fällig: {dueDate.toLocaleDateString('de-DE')}</span>
                <span className="text-kwd-muted">Alle {task.frequency_days} Tage</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setActiveTask({
                    id: task.id,
                    title: task.title,
                    frequency_days: task.frequency_days,
                    machineName: machine?.name ?? 'Unbekannt',
                  })
                }
                className="bg-kwd-surface-light mt-3 min-h-[44px] w-full rounded-lg font-semibold"
              >
                Checkliste öffnen
              </button>
            </article>
          )
        })}
      </div>

      {activeTask && (
        <ChecklistPanel
          taskId={activeTask.id}
          taskTitle={activeTask.title}
          machineName={activeTask.machineName}
          frequencyDays={activeTask.frequency_days}
          onClose={() => setActiveTask(null)}
        />
      )}
    </>
  )
}
