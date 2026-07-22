import { supabase } from './supabase'
import type { TicketPriority } from '../types/database'

/** Ticket anlegen – mit created_by, Fallback ohne Spalte falls Migration fehlt. */
export async function insertTicketRow(input: {
  machine_id?: string | null
  reference_label?: string | null
  description: string
  priority: TicketPriority
  status?: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_by?: string | null
}) {
  const machineId = input.machine_id?.trim() || null
  const referenceLabel = input.reference_label?.trim() || null

  if (!machineId && !referenceLabel) {
    return {
      data: null,
      error: { message: 'Maschine oder Bezugspunkt erforderlich' },
    }
  }

  const base = {
    machine_id: machineId,
    reference_label: referenceLabel,
    description: input.description,
    priority: input.priority,
    status: input.status ?? ('open' as const),
  }

  const withAuthor = {
    ...base,
    created_by: input.created_by ?? null,
  }

  let result = await supabase.from('tickets').insert(withAuthor).select('id').single()

  if (result.error && /created_by/i.test(result.error.message)) {
    result = await supabase.from('tickets').insert(base).select('id').single()
  }

  if (
    result.error &&
    /reference_label|schema cache/i.test(result.error.message) &&
    !machineId
  ) {
    return {
      data: null,
      error: {
        message:
          'Freie Störungen brauchen die Spalte reference_label in Supabase. Bitte supabase/FIX_TICKET_REFERENCE.sql ausführen.',
      },
    }
  }

  if (result.error && /reference_label|schema cache/i.test(result.error.message)) {
    const { reference_label: _r, ...withoutReference } = withAuthor
    result = await supabase.from('tickets').insert(withoutReference).select('id').single()
    if (!result.error && !machineId) {
      return {
        data: null,
        error: {
          message:
            'Freie Störungen brauchen die Spalte reference_label in Supabase. Bitte supabase/FIX_TICKET_REFERENCE.sql ausführen.',
        },
      }
    }
  }

  if (
    result.error &&
    /null value in column "machine_id"|machine_id.*not-null|violates not-null/i.test(
      result.error.message,
    ) &&
    !machineId
  ) {
    return {
      data: null,
      error: {
        message:
          'Störungen ohne Maschine brauchen eine DB-Migration. Bitte supabase/FIX_TICKET_REFERENCE.sql ausführen.',
      },
    }
  }

  return result
}
