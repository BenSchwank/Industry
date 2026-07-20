/** Farbstatus für nächste Wartung: ok | soon (≤3 Monate) | overdue */
export type MaintenanceDueTone = 'ok' | 'soon' | 'overdue' | 'none'

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000

export function maintenanceDueTone(date: string | null | undefined): MaintenanceDueTone {
  if (!date) return 'none'
  const due = new Date(date)
  if (Number.isNaN(due.getTime())) return 'none'
  const now = new Date()
  const diff = due.getTime() - now.getTime()
  if (diff < 0) return 'overdue'
  if (diff <= THREE_MONTHS_MS) return 'soon'
  return 'ok'
}

export function maintenanceDueClass(date: string | null | undefined): string {
  const tone = maintenanceDueTone(date)
  if (tone === 'overdue') return 'text-kwd-danger font-semibold'
  if (tone === 'soon') return 'text-kwd-warning font-semibold'
  return ''
}

export function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
