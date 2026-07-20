import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDaysIso,
  formatDurationDays,
  maintenanceDueClass,
  maintenanceDueTone,
  splitDurationInput,
  type DurationUnit,
} from '../../lib/maintenanceDue'
import { insertLifecycleEntry } from '../../lib/insertLifecycleEntry'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { DurationUnitField, parseDurationInput } from '../ui/DurationUnitField'

interface ChecklistPanelProps {
  taskId: string
  machineId: string
  taskTitle: string
  machineName: string
  machineBarcode?: string
  frequencyDays: number
  nextDueDate: string
  onClose: () => void
}

export function ChecklistPanel({
  taskId,
  machineId,
  taskTitle,
  machineName,
  machineBarcode,
  frequencyDays,
  nextDueDate,
  onClose,
}: ChecklistPanelProps) {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState('')
  const initialDuration = splitDurationInput(frequencyDays)
  const [durationValue, setDurationValue] = useState(initialDuration.value)
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(initialDuration.unit)
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

  useEffect(() => {
    const next = splitDurationInput(frequencyDays)
    setDurationValue(next.value)
    setDurationUnit(next.unit)
  }, [frequencyDays])

  const hasSteps = Boolean(items && items.length > 0)
  const allChecked = hasSteps ? items!.every((i) => checked[i.id]) : true
  const parsed = parseDurationInput(durationValue, durationUnit)
  const days = parsed.ok ? parsed.days : Math.max(1, Math.round(frequencyDays || 90))
  const previewNext = addDaysIso(new Date().toISOString(), days)
  const canComplete = allChecked && !submitting && parsed.ok

  async function handleComplete() {
    if (!canComplete || !parsed.ok) return
    setSubmitting(true)
    setError(null)

    try {
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
        throw new Error(completionError?.message ?? 'Fehler beim Speichern')
      }

      if (hasSteps && items) {
        const completionItems = items.map((item) => ({
          completion_id: completion.id,
          label: item.label,
          checked: checked[item.id] ?? false,
        }))
        const { error: itemsError } = await supabase
          .from('maintenance_completion_items')
          .insert(completionItems)
        if (itemsError) throw new Error(itemsError.message)
      }

      const nextDue = previewNext
      const { error: taskErr } = await supabase
        .from('maintenance_tasks')
        .update({
          frequency_days: days,
          next_due_date: nextDue,
        })
        .eq('id', taskId)
      if (taskErr) throw new Error(taskErr.message)

      // Auch im Lebenszyklus sichtbar machen
      const life = await insertLifecycleEntry({
        machine_id: machineId,
        entry_type: 'maintenance',
        title: taskTitle || 'Wartung',
        description: notes.trim() || null,
        occurred_at: new Date().toISOString(),
        created_by: user?.id ?? null,
        duration_days: days,
        next_due_date: nextDue,
      })
      if (life.error) {
        console.warn('Lebenszyklus-Eintrag:', life.error.message)
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['maintenance-completions'] }),
        queryClient.invalidateQueries({ queryKey: ['machine-timeline', machineId] }),
        queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] }),
      ])

      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
      setSubmitting(false)
    }
  }

  function toggleItem(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const currentTone = maintenanceDueTone(nextDueDate)

  return (
    <div className="bg-kwd-bg text-kwd-text fixed inset-0 z-50 flex flex-col">
      <div className="bg-kwd-surface border-kwd-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-kwd-muted text-xs">
            {machineBarcode ? `${machineBarcode} · ` : ''}
            {machineName}
          </p>
          <h3 className="font-bold">{taskTitle}</h3>
          {profile?.username && (
            <p className="text-kwd-muted text-[11px]">Als {profile.username}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="kwd-btn shrink-0">
          Schließen
        </button>
      </div>

      <div className="bg-kwd-bg min-h-0 flex-1 overflow-y-auto p-4">
        <div className="border-kwd-border bg-kwd-surface mb-4 rounded-xl border p-3 text-sm">
          <p>
            Aktuell fällig:{' '}
            <span className={maintenanceDueClass(nextDueDate) || undefined}>
              {new Date(nextDueDate).toLocaleDateString('de-DE')}
              {currentTone === 'overdue' && ' · überfällig'}
              {currentTone === 'soon' && ' · bald'}
            </span>
          </p>
          <p className="text-kwd-muted mt-1">
            Bisheriges Intervall: {formatDurationDays(frequencyDays)}
          </p>
        </div>

        {isLoading && <p className="text-kwd-muted">Lade Checkliste…</p>}

        {!isLoading && !hasSteps && (
          <p className="bg-kwd-surface-light text-kwd-muted mb-4 rounded-xl px-3 py-3 text-sm">
            Keine Checklisten-Schritte – du kannst die Wartung trotzdem mit Notizen und Dauer
            abschließen.
          </p>
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
                    : 'bg-kwd-surface border-kwd-border border-2'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${
                    checked[item.id] ? 'bg-kwd-success text-white' : 'bg-kwd-surface-light'
                  }`}
                >
                  {checked[item.id] ? '✓' : ''}
                </span>
                <span className="font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <DurationUnitField
          label="Dauer bis zur nächsten Wartung"
          value={durationValue}
          unit={durationUnit}
          onValueChange={setDurationValue}
          onUnitChange={setDurationUnit}
          className="mt-6 block"
          hint={
            <p className={`mt-1 text-xs ${maintenanceDueClass(previewNext) || 'text-kwd-muted'}`}>
              Nächste Wartung nach Abschluss: {new Date(previewNext).toLocaleDateString('de-DE')}
              {parsed.ok && durationUnit === 'years' && (
                <span> · gespeichert als {formatDurationDays(days)}</span>
              )}
            </p>
          }
        />

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Notizen (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="border-kwd-border bg-kwd-surface mt-1 w-full border px-4 py-3"
            placeholder="Besonderheiten, Messwerte…"
          />
        </label>

        {error && <p className="text-kwd-danger mt-3 text-sm">{error}</p>}
      </div>

      <div className="border-kwd-border bg-kwd-surface safe-area-bottom shrink-0 border-t p-4">
        <button
          type="button"
          disabled={!canComplete}
          onClick={() => void handleComplete()}
          className="bg-kwd-primary min-h-[56px] w-full rounded-xl text-lg font-bold text-white disabled:opacity-40"
        >
          {submitting ? 'Speichern…' : 'Wartung abschließen'}
        </button>
        {hasSteps && !allChecked && (
          <p className="text-kwd-muted mt-2 text-center text-xs">
            Alle {items!.length} Punkte abhaken um abzuschließen
          </p>
        )}
      </div>
    </div>
  )
}
