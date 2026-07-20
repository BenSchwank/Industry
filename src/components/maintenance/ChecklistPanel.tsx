import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

interface ChecklistPanelProps {
  taskId: string
  taskTitle: string
  machineName: string
  frequencyDays: number
  onClose: () => void
}

export function ChecklistPanel({
  taskId,
  taskTitle,
  machineName,
  frequencyDays,
  onClose,
}: ChecklistPanelProps) {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: items, isLoading } = useQuery({
    queryKey: ['checklist-items', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_checklist_items')
        .select('id, label, sort_order')
        .eq('task_id', taskId)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (items) {
      const initial: Record<string, boolean> = {}
      for (const item of items) initial[item.id] = false
      setChecked(initial)
    }
  }, [items])

  const allChecked = items?.length ? items.every((i) => checked[i.id]) : false

  async function handleComplete() {
    if (!items?.length || !allChecked) return
    setSubmitting(true)
    setError(null)

    const { data: completion, error: completionError } = await supabase
      .from('maintenance_completions')
      .insert({
        task_id: taskId,
        completed_by: user?.id ?? null,
        notes: notes.trim() || null,
      })
      .select('id')
      .single()

    if (completionError || !completion) {
      setError(completionError?.message ?? 'Fehler beim Speichern')
      setSubmitting(false)
      return
    }

    const completionItems = items.map((item) => ({
      completion_id: completion.id,
      label: item.label,
      checked: checked[item.id] ?? false,
    }))

    const { error: itemsError } = await supabase
      .from('maintenance_completion_items')
      .insert(completionItems)

    if (itemsError) {
      setError(itemsError.message)
      setSubmitting(false)
      return
    }

    const nextDue = new Date()
    nextDue.setDate(nextDue.getDate() + frequencyDays)

    await supabase
      .from('maintenance_tasks')
      .update({ next_due_date: nextDue.toISOString().slice(0, 10) })
      .eq('id', taskId)

    await queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
    await queryClient.invalidateQueries({ queryKey: ['maintenance-completions'] })
    setSubmitting(false)
    onClose()
  }

  function toggleItem(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="bg-kwd-bg/80 fixed inset-0 z-50 flex flex-col">
      <div className="bg-kwd-surface border-kwd-surface-light flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-kwd-muted text-xs">{machineName}</p>
          <h3 className="font-bold">{taskTitle}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="bg-kwd-surface-light min-h-[44px] rounded-lg px-4 font-semibold"
        >
          Schließen
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-kwd-muted">Lade Checkliste…</p>}

        {!isLoading && items?.length === 0 && (
          <p className="text-kwd-muted">Keine Checklisten-Schritte definiert.</p>
        )}

        <ul className="flex flex-col gap-2">
          {items?.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`flex min-h-[56px] w-full items-center gap-4 rounded-xl p-4 text-left transition-colors ${
                  checked[item.id]
                    ? 'bg-kwd-success/20 border-kwd-success border-2'
                    : 'bg-kwd-surface border-kwd-surface-light border-2'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${
                    checked[item.id] ? 'bg-kwd-success text-kwd-bg' : 'bg-kwd-bg'
                  }`}
                >
                  {checked[item.id] ? '✓' : ''}
                </span>
                <span className="font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <label className="mt-6 block">
          <span className="text-kwd-muted text-sm font-medium">Notizen (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="bg-kwd-surface border-kwd-surface-light mt-1 w-full rounded-xl border px-4 py-3"
            placeholder="Besonderheiten, Messwerte…"
          />
        </label>

        {error && <p className="text-kwd-danger mt-3 text-sm">{error}</p>}
      </div>

      <div className="border-kwd-surface-light safe-area-bottom border-t p-4">
        <button
          type="button"
          disabled={!allChecked || submitting}
          onClick={handleComplete}
          className="bg-kwd-primary text-kwd-bg min-h-[56px] w-full rounded-xl text-lg font-bold disabled:opacity-40"
        >
          {submitting ? 'Speichern…' : 'Wartung abschließen'}
        </button>
        {!allChecked && items && items.length > 0 && (
          <p className="text-kwd-muted mt-2 text-center text-xs">
            Alle {items.length} Punkte abhaken um abzuschließen
          </p>
        )}
      </div>
    </div>
  )
}
