import { formatSupabaseError } from './formatError'
import { supabase } from './supabase'

function toDateOnly(value: string): string {
  return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10)
}

/**
 * Setzt oder entfernt die „nächste geplante Wartung / Reparatur“ (HU-Aufgabe).
 * Reparatur-Monteur-Termine bleiben als eigene Tasks erhalten.
 */
export async function setMachineNextMaintenance(
  machineId: string,
  nextDueDate: string | null,
): Promise<void> {
  if (nextDueDate) {
    await setNextDue(machineId, toDateOnly(nextDueDate))
  } else {
    await clearNextDue(machineId)
  }
}

const HU_TASK_TITLE = 'Hauptuntersuchung'

async function setNextDue(machineId: string, nextDueDate: string): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('maintenance_tasks')
    .select('id, frequency_days')
    .eq('machine_id', machineId)
    .eq('title', HU_TASK_TITLE)
    .limit(1)

  if (findError) throw new Error(formatSupabaseError(findError))

  const frequencyDays =
    existing?.[0]?.frequency_days && existing[0].frequency_days > 0
      ? existing[0].frequency_days
      : 90

  if (existing?.[0]?.id) {
    const { error } = await supabase
      .from('maintenance_tasks')
      .update({
        next_due_date: nextDueDate,
        title: HU_TASK_TITLE,
        frequency_days: frequencyDays,
      })
      .eq('id', existing[0].id)
    if (error) throw new Error(formatSupabaseError(error))
  } else {
    const { error } = await supabase.from('maintenance_tasks').insert({
      machine_id: machineId,
      title: HU_TASK_TITLE,
      frequency_days: frequencyDays,
      next_due_date: nextDueDate,
    })
    if (error) throw new Error(formatSupabaseError(error))
  }

  const { data: life, error: lifeFindError } = await supabase
    .from('machine_lifecycle_entries')
    .select('id')
    .eq('machine_id', machineId)
    .eq('entry_type', 'maintenance')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lifeFindError && !/duration_days|next_due_date|schema cache/i.test(lifeFindError.message)) {
    throw new Error(formatSupabaseError(lifeFindError))
  }

  if (life?.id) {
    const { error } = await supabase
      .from('machine_lifecycle_entries')
      .update({ next_due_date: nextDueDate })
      .eq('id', life.id)
    if (error && !/next_due_date|schema cache/i.test(error.message)) {
      throw new Error(formatSupabaseError(error))
    }
  }
}

async function clearNextDue(machineId: string): Promise<void> {
  // Nur HU-Aufgabe entfernen – geplante Reparaturen bleiben
  const { error: taskError } = await supabase
    .from('maintenance_tasks')
    .delete()
    .eq('machine_id', machineId)
    .eq('title', HU_TASK_TITLE)
  if (taskError) throw new Error(formatSupabaseError(taskError))

  const { data: life, error: lifeFindError } = await supabase
    .from('machine_lifecycle_entries')
    .select('id')
    .eq('machine_id', machineId)
    .eq('entry_type', 'maintenance')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lifeFindError) {
    if (/duration_days|next_due_date|schema cache/i.test(lifeFindError.message)) return
    throw new Error(formatSupabaseError(lifeFindError))
  }

  if (!life?.id) return

  const { error } = await supabase
    .from('machine_lifecycle_entries')
    .update({ next_due_date: null, duration_days: null })
    .eq('id', life.id)

  if (error && !/next_due_date|duration_days|schema cache/i.test(error.message)) {
    throw new Error(formatSupabaseError(error))
  }
}
