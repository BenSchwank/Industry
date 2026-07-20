import { supabase } from './supabase'
import type { TicketPriority } from '../types/database'

/** Ticket anlegen – mit created_by, Fallback ohne Spalte falls Migration fehlt. */
export async function insertTicketRow(input: {
  machine_id: string
  description: string
  priority: TicketPriority
  status?: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_by?: string | null
}) {
  const base = {
    machine_id: input.machine_id,
    description: input.description,
    priority: input.priority,
    status: input.status ?? ('open' as const),
  }

  const withAuthor = {
    ...base,
    created_by: input.created_by ?? null,
  }

  const first = await supabase.from('tickets').insert(withAuthor).select('id').single()
  if (!first.error) return first

  if (/created_by/i.test(first.error.message)) {
    return supabase.from('tickets').insert(base).select('id').single()
  }

  return first
}
