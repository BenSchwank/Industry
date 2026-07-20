export function computeUptimeDays(lastResolvedAt: string | null): number | null {
  if (!lastResolvedAt) return null
  const resolved = new Date(lastResolvedAt)
  const now = new Date()
  const diffMs = now.getTime() - resolved.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export function formatUptime(days: number | null): string {
  if (days === null) return 'Noch kein abgeschlossener Vorfall'
  if (days === 0) return 'Heute wieder problemfrei'
  if (days === 1) return '1 Tag problemfrei'
  return `${days} Tage problemfrei`
}

/** Kurze Anzeige für schmale Split-/Drawer-Ansichten */
export function formatUptimeCompact(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return '0 d'
  return `${days} d`
}

export function uptimeHealthClass(days: number | null, hasOpenTickets: boolean): string {
  if (hasOpenTickets) return 'text-kwd-danger'
  if (days === null) return 'text-kwd-success'
  if (days >= 30) return 'text-kwd-success'
  if (days >= 7) return 'text-kwd-primary'
  return 'text-kwd-warning'
}
