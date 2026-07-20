import { supabase } from './supabase'
import type { LifecycleEntryType } from '../types/database'

function isMissingColumnError(message: string) {
  return /duration_days|next_due_date|created_by|schema cache/i.test(message)
}

/** Lifecycle-Eintrag – Fallback wenn created_by / duration-Spalten fehlen. */
export async function insertLifecycleEntry(input: {
  machine_id: string
  entry_type: LifecycleEntryType
  title: string
  description?: string | null
  occurred_at?: string
  created_by?: string | null
  duration_days?: number | null
  next_due_date?: string | null
}) {
  const base = {
    machine_id: input.machine_id,
    entry_type: input.entry_type,
    title: input.title,
    description: input.description ?? null,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  }

  const withDuration =
    input.duration_days != null
      ? {
          ...base,
          duration_days: input.duration_days,
          next_due_date: input.next_due_date ?? null,
        }
      : base

  const attempts = [
    { ...withDuration, created_by: input.created_by ?? null },
    withDuration,
    { ...base, created_by: input.created_by ?? null },
    base,
  ]

  let last = await supabase.from('machine_lifecycle_entries').insert(attempts[0]).select().single()
  if (!last.error) return last

  for (let i = 1; i < attempts.length; i++) {
    if (!isMissingColumnError(last.error.message)) return last
    last = await supabase.from('machine_lifecycle_entries').insert(attempts[i]).select().single()
    if (!last.error) return last
  }

  return last
}
