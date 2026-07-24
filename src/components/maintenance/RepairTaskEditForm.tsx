import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface RepairTaskEditTarget {
  id: string
  machineId: string
  title: string
  next_due_date: string
  machineLabel?: string
  /** true = Hauptuntersuchung (Intervall bleibt), false = geplante Reparatur (nur Datum) */
  isHu?: boolean
}

interface RepairTaskEditFormProps {
  task: RepairTaskEditTarget
  onClose: () => void
  onSuccess: (message: string) => void
}

function toDateOnly(value: string): string {
  return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10)
}

/**
 * Geplante Reparatur / HU-Aufgabe im Reparaturen-Tab bearbeiten (Titel + Termin).
 */
export function RepairTaskEditForm({ task, onClose, onSuccess }: RepairTaskEditFormProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(task.title)
  const [dueDate, setDueDate] = useState(toDateOnly(task.next_due_date))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const cleanTitle = title.trim()
      if (!cleanTitle) throw new Error('Titel ist erforderlich')
      const due = dueDate.trim()
      if (!due) throw new Error('Bitte ein Datum setzen')

      const { data: current, error: findErr } = await supabase
        .from('maintenance_tasks')
        .select('id, title, frequency_days, machine_id')
        .eq('id', task.id)
        .maybeSingle()
      if (findErr) throw findErr
      if (!current) throw new Error('Aufgabe nicht gefunden')

      const { error: updErr } = await supabase
        .from('maintenance_tasks')
        .update({
          title: cleanTitle,
          next_due_date: due,
        })
        .eq('id', task.id)
      if (updErr) throw updErr

      // Passenden Lifecycle-Eintrag (Reparatur) mitziehen, falls vorhanden
      if (!task.isHu) {
        const oldTitle = current.title
        const { data: life } = await supabase
          .from('machine_lifecycle_entries')
          .select('id')
          .eq('machine_id', task.machineId)
          .eq('entry_type', 'repair')
          .eq('title', oldTitle)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (life?.id) {
          await supabase
            .from('machine_lifecycle_entries')
            .update({
              title: cleanTitle,
              next_due_date: due,
            })
            .eq('id', life.id)
        }
      } else {
        const { data: life } = await supabase
          .from('machine_lifecycle_entries')
          .select('id')
          .eq('machine_id', task.machineId)
          .eq('entry_type', 'maintenance')
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (life?.id) {
          await supabase
            .from('machine_lifecycle_entries')
            .update({ next_due_date: due })
            .eq('id', life.id)
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['machine-timeline', task.machineId] })
      void queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await save.mutateAsync()
      onSuccess('Gespeichert.')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">
          {task.isHu ? 'Wartung bearbeiten' : 'Geplante Reparatur bearbeiten'}
        </h3>
        {task.machineLabel && (
          <p className="text-kwd-primary mt-1 text-sm font-semibold">{task.machineLabel}</p>
        )}

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Titel</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={task.isHu}
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base disabled:opacity-60"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">
            {task.isHu ? 'Nächste Fälligkeit' : 'Geplantes Datum'}
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
          />
          {!task.isHu && (
            <p className="text-kwd-muted mt-1 text-xs">Nur das Datum der geplanten Reparatur.</p>
          )}
        </label>

        {error && <p className="text-kwd-danger mt-3 text-sm font-medium">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-kwd-surface-light min-h-[48px] flex-1 rounded-xl font-semibold"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="bg-kwd-primary text-kwd-bg min-h-[48px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {save.isPending ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}
