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

/** Kalenderjahr ≈ 365 Tage (für Speicherung als duration_days / frequency_days) */
export const DAYS_PER_YEAR = 365

export type DurationUnit = 'days' | 'years'

export function toDurationDays(value: number, unit: DurationUnit): number {
  const n = Math.max(0, Math.round(value))
  if (unit === 'years') return n * DAYS_PER_YEAR
  return n
}

/** Anzeige: ganze Jahre als „X Jahr(e)“, sonst Tage */
export function formatDurationDays(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days <= 0) return '–'
  const d = Math.round(days)
  if (d >= DAYS_PER_YEAR && d % DAYS_PER_YEAR === 0) {
    const y = d / DAYS_PER_YEAR
    return y === 1 ? '1 Jahr' : `${y} Jahre`
  }
  return d === 1 ? '1 Tag' : `${d} Tage`
}

/** Startwert für Eingabe: wenn Intervall ganze Jahre, Einheit „Jahre“ */
export function splitDurationInput(days: number | null | undefined): {
  value: string
  unit: DurationUnit
} {
  const d = Math.max(1, Math.round(days || 90))
  if (d >= DAYS_PER_YEAR && d % DAYS_PER_YEAR === 0) {
    return { value: String(d / DAYS_PER_YEAR), unit: 'years' }
  }
  return { value: String(d), unit: 'days' }
}
