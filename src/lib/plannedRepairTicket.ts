/** Kennzeichnung: Ticket ist eine geplante Reparatur (nicht normale Störung). */
export const PLANNED_REPAIR_MARKER = '[Geplante Reparatur]'

/** Nur explizit als geplante Reparatur markierte Tickets (Bezugspunkt → Reparaturen-Tab). */
export function isPlannedRepairTicket(description: string | null | undefined): boolean {
  return (description ?? '').trim().startsWith(PLANNED_REPAIR_MARKER)
}

/** Beschreibung für geplante Reparatur speichern (Marker setzen). */
export function withPlannedRepairMarker(description: string): string {
  const clean = description.trim()
  if (!clean) return PLANNED_REPAIR_MARKER
  if (isPlannedRepairTicket(clean)) return clean
  return `${PLANNED_REPAIR_MARKER}\n${clean}`
}

/** Marker für Anzeige entfernen. */
export function stripPlannedRepairMarker(description: string | null | undefined): string {
  const text = (description ?? '').trim()
  if (!text.startsWith(PLANNED_REPAIR_MARKER)) return text
  return text.slice(PLANNED_REPAIR_MARKER.length).replace(/^\n/, '').trim()
}
