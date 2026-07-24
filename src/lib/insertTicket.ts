import { supabase } from './supabase'
import { TICKET_KIND_SQL_HINT, withPlannedRepairMarker } from './plannedRepairTicket'
import type { TicketKind, TicketPriority } from '../types/database'

/** Ticket anlegen – mit created_by / lifecycle_entry_id / kind, Fallback wenn Spalten fehlen. */
export async function insertTicketRow(input: {
  machine_id?: string | null
  reference_label?: string | null
  description: string
  priority: TicketPriority
  status?: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_by?: string | null
  lifecycle_entry_id?: string | null
  kind?: TicketKind
}) {
  const machineId = input.machine_id?.trim() || null
  const referenceLabel = input.reference_label?.trim() || null
  const lifecycleEntryId = input.lifecycle_entry_id?.trim() || null
  const kind: TicketKind = input.kind ?? 'issue'

  if (!machineId && !referenceLabel) {
    return {
      data: null,
      error: { message: 'Maschine oder Bezugspunkt erforderlich' },
    }
  }

  let description = input.description
  if (kind === 'planned_repair') {
    description =
      input.description.replace(/^\[Geplante Reparatur\]\n?/, '').trim() || input.description
  }

  const base: Record<string, unknown> = {
    machine_id: machineId,
    reference_label: referenceLabel,
    description,
    priority: input.priority,
    status: input.status ?? ('open' as const),
    kind,
  }

  if (lifecycleEntryId) base.lifecycle_entry_id = lifecycleEntryId

  const withAuthor = {
    ...base,
    created_by: input.created_by ?? null,
  }

  let result = await supabase.from('tickets').insert(withAuthor as never).select('id').single()
  let kindMissing = false

  if (result.error && /created_by/i.test(result.error.message)) {
    result = await supabase.from('tickets').insert(base as never).select('id').single()
  }

  if (result.error && /\bkind\b|schema cache/i.test(result.error.message)) {
    kindMissing = true
    const { kind: _k, ...withoutKind } = withAuthor as Record<string, unknown> & { kind?: string }
    if (kind === 'planned_repair') {
      withoutKind.description = withPlannedRepairMarker(String(withoutKind.description ?? ''))
    }
    result = await supabase.from('tickets').insert(withoutKind as never).select('id').single()
    if (result.error && /created_by/i.test(result.error.message)) {
      const { created_by: _c, ...bare } = withoutKind as Record<string, unknown> & {
        created_by?: string | null
      }
      result = await supabase.from('tickets').insert(bare as never).select('id').single()
    }
  }

  if (result.error && /lifecycle_entry_id|schema cache/i.test(result.error.message)) {
    const { lifecycle_entry_id: _l, ...withoutLife } = withAuthor as Record<string, unknown> & {
      lifecycle_entry_id?: string | null
    }
    result = await supabase.from('tickets').insert(withoutLife as never).select('id').single()
    if (!result.error && lifecycleEntryId) {
      return {
        ...result,
        warning:
          'Störung gespeichert, Reparatur-Verknüpfung fehlt in der DB. Bitte supabase/FIX_TICKET_LIFECYCLE_LINK.sql ausführen.',
      }
    }
    if (result.error && /\bkind\b|schema cache/i.test(result.error.message)) {
      kindMissing = true
      const { kind: _k, ...withoutKind } = withoutLife as Record<string, unknown> & { kind?: string }
      if (kind === 'planned_repair') {
        withoutKind.description = withPlannedRepairMarker(String(withoutKind.description ?? ''))
      }
      result = await supabase.from('tickets').insert(withoutKind as never).select('id').single()
    }
    if (result.error && /created_by/i.test(result.error.message)) {
      const { created_by: _c, lifecycle_entry_id: _l2, ...bare } = withoutLife as Record<
        string,
        unknown
      > & { created_by?: string | null; lifecycle_entry_id?: string | null }
      result = await supabase.from('tickets').insert(bare as never).select('id').single()
    }
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
    const { reference_label: _r, ...withoutReference } = withAuthor as Record<string, unknown> & {
      reference_label?: string | null
    }
    result = await supabase.from('tickets').insert(withoutReference as never).select('id').single()
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

  if (!result.error && kindMissing && kind === 'planned_repair') {
    return {
      ...result,
      warning: `Geplante Reparatur gespeichert (Legacy-Marker). ${TICKET_KIND_SQL_HINT}`,
    }
  }

  return result
}
