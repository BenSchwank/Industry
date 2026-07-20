import { addDaysIso } from './maintenanceDue'
import { insertLifecycleEntry } from './insertLifecycleEntry'
import { supabase } from './supabase'

export interface QuickCompleteInput {
  machineId: string
  machineName?: string
  /** Optional: bekannte Aufgabe; sonst wird die nächste offene Task der Maschine gesucht */
  taskId?: string
  taskTitle?: string
  frequencyDays?: number
  completedBy?: string | null
  notes?: string | null
}

export interface QuickCompleteResult {
  nextDueDate: string
  durationDays: number
  title: string
}

/**
 * Wartung in einem Schritt abschließen:
 * Completion + Task-Update (falls vorhanden) + Lebenszyklus-Eintrag.
 */
export async function completeMaintenanceQuick(
  input: QuickCompleteInput,
): Promise<QuickCompleteResult> {
  let taskId = input.taskId ?? null
  let title = input.taskTitle?.trim() || 'Wartung'
  let frequencyDays = input.frequencyDays ?? 90

  if (!taskId) {
    const { data: tasks, error } = await supabase
      .from('maintenance_tasks')
      .select('id, title, frequency_days, next_due_date')
      .eq('machine_id', input.machineId)
      .order('next_due_date', { ascending: true })
      .limit(1)

    if (error) throw new Error(error.message)
    const task = tasks?.[0]
    if (task) {
      taskId = task.id
      title = task.title || title
      frequencyDays = task.frequency_days || frequencyDays
    } else {
      // Keine Task → Dauer aus letztem Lebenszyklus-Wartungseintrag
      const { data: life } = await supabase
        .from('machine_lifecycle_entries')
        .select('duration_days, title')
        .eq('machine_id', input.machineId)
        .eq('entry_type', 'maintenance')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (life?.duration_days && life.duration_days > 0) {
        frequencyDays = life.duration_days
      }
      if (life?.title) title = life.title
    }
  }

  const days = Math.max(1, Math.round(frequencyDays))
  const nextDueDate = addDaysIso(new Date().toISOString(), days)
  const notes = input.notes?.trim() || null

  if (taskId) {
    const { data: completion, error: completionError } = await supabase
      .from('maintenance_completions')
      .insert({
        task_id: taskId,
        completed_by: input.completedBy ?? null,
        notes,
      })
      .select('id')
      .single()

    if (completionError || !completion) {
      throw new Error(completionError?.message ?? 'Abschluss konnte nicht gespeichert werden')
    }

    // Checklisten-Punkte falls vorhanden automatisch abhaken
    const { data: items } = await supabase
      .from('maintenance_checklist_items')
      .select('id, label')
      .eq('task_id', taskId)

    if (items && items.length > 0) {
      const { error: itemsError } = await supabase.from('maintenance_completion_items').insert(
        items.map((item) => ({
          completion_id: completion.id,
          label: item.label,
          checked: true,
        })),
      )
      if (itemsError) throw new Error(itemsError.message)
    }

    const { error: taskErr } = await supabase
      .from('maintenance_tasks')
      .update({
        frequency_days: days,
        next_due_date: nextDueDate,
      })
      .eq('id', taskId)
    if (taskErr) throw new Error(taskErr.message)
  }

  const life = await insertLifecycleEntry({
    machine_id: input.machineId,
    entry_type: 'maintenance',
    title,
    description: notes,
    occurred_at: new Date().toISOString(),
    created_by: input.completedBy ?? null,
    duration_days: days,
    next_due_date: nextDueDate,
  })
  if (life.error) {
    console.warn('[KWD] Lebenszyklus nach Schnellabschluss:', life.error.message)
  }

  return { nextDueDate, durationDays: days, title }
}
