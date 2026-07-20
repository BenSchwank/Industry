import { supabase } from './supabase'
import { formatSupabaseError } from './formatError'
import type { MachineInput } from '../hooks/useMachines'

export async function applyMachineInitialDates(
  machineId: string,
  input: Pick<
    MachineInput,
    'last_maintenance_at' | 'next_maintenance_at' | 'last_repair_at'
  >,
): Promise<void> {
  if (input.last_maintenance_at) {
    const { error } = await supabase.from('machine_lifecycle_entries').insert({
      machine_id: machineId,
      entry_type: 'maintenance',
      title: 'Letzte Wartung',
      occurred_at: toIso(input.last_maintenance_at),
    })
    if (error) throw new Error(formatSupabaseError(error))
  }

  if (input.last_repair_at) {
    const { error } = await supabase.from('machine_lifecycle_entries').insert({
      machine_id: machineId,
      entry_type: 'repair',
      title: 'Letzte Reparatur',
      occurred_at: toIso(input.last_repair_at),
    })
    if (error) throw new Error(formatSupabaseError(error))
  }

  if (input.next_maintenance_at) {
    const { error } = await supabase.from('maintenance_tasks').insert({
      machine_id: machineId,
      title: 'Wartung',
      frequency_days: 30,
      next_due_date: input.next_maintenance_at,
    })
    if (error) throw new Error(formatSupabaseError(error))
  }
}

function toIso(date: string): string {
  if (date.includes('T')) return date
  return new Date(`${date}T12:00:00`).toISOString()
}
