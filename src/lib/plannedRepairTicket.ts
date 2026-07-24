import type { TicketKind } from '../types/database'

/** Legacy-Kennzeichnung in der Beschreibung (Fallback wenn Spalte `kind` fehlt). */
export const PLANNED_REPAIR_MARKER = '[Geplante Reparatur]'

export const TICKET_KIND_SQL_HINT =
  'Bitte in Supabase ausführen: supabase/FIX_TICKET_KIND.sql (oder FIX_ALL_PENDING.sql). Siehe docs/SCHEMA_DEPLOY.md'

/** Ob ein Ticket als geplante Reparatur gilt (Spalte oder Legacy-Marker). */
export function isPlannedRepairTicket(input: {
  kind?: TicketKind | string | null
  description?: string | null
  lifecycle_entry_id?: string | null
}): boolean {
  if (input.kind === 'planned_repair') return true
  if (input.kind === 'issue') return false
  const text = (input.description ?? '').trim()
  if (text.startsWith(PLANNED_REPAIR_MARKER)) return true
  return false
}

/** Beschreibung ohne Legacy-Marker (Anzeige). */
export function stripPlannedRepairMarker(description: string | null | undefined): string {
  const text = (description ?? '').trim()
  if (!text.startsWith(PLANNED_REPAIR_MARKER)) return text
  return text.slice(PLANNED_REPAIR_MARKER.length).replace(/^\n/, '').trim()
}

/** Legacy: Marker in Beschreibung setzen (nur Fallback-Pfad). */
export function withPlannedRepairMarker(description: string): string {
  const clean = description.trim()
  if (!clean) return PLANNED_REPAIR_MARKER
  if (clean.startsWith(PLANNED_REPAIR_MARKER)) return clean
  return `${PLANNED_REPAIR_MARKER}\n${clean}`
}

export function resolveTicketKind(input: {
  kind?: TicketKind | string | null
  description?: string | null
}): TicketKind {
  return isPlannedRepairTicket(input) ? 'planned_repair' : 'issue'
}
