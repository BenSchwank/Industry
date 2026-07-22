/** Optionale Wartungsplan-Felder (Aushang) – fehlen die Spalten, bleiben sie null */
export const MACHINE_OIL_DATE_FIELDS = [
  'last_cutting_oil_at',
  'next_cutting_oil_at',
  'last_hydraulic_oil_at',
  'next_hydraulic_oil_at',
  'last_maintenance_code',
  'next_maintenance_code',
  'last_hydraulic_code',
] as const

export type MachineOilDateField = (typeof MACHINE_OIL_DATE_FIELDS)[number]

export interface MachineOilDates {
  last_cutting_oil_at: string | null
  next_cutting_oil_at: string | null
  last_hydraulic_oil_at: string | null
  next_hydraulic_oil_at: string | null
  last_maintenance_code: string | null
  next_maintenance_code: string | null
  last_hydraulic_code: string | null
}

export const EMPTY_MACHINE_OIL_DATES: MachineOilDates = {
  last_cutting_oil_at: null,
  next_cutting_oil_at: null,
  last_hydraulic_oil_at: null,
  next_hydraulic_oil_at: null,
  last_maintenance_code: null,
  next_maintenance_code: null,
  last_hydraulic_code: null,
}

export function pickOilDates(
  row: Partial<MachineOilDates> | null | undefined,
): MachineOilDates {
  return {
    last_cutting_oil_at: row?.last_cutting_oil_at?.trim() || null,
    next_cutting_oil_at: row?.next_cutting_oil_at?.trim() || null,
    last_hydraulic_oil_at: row?.last_hydraulic_oil_at?.trim() || null,
    next_hydraulic_oil_at: row?.next_hydraulic_oil_at?.trim() || null,
    last_maintenance_code: row?.last_maintenance_code?.trim() || null,
    next_maintenance_code: row?.next_maintenance_code?.trim() || null,
    last_hydraulic_code: row?.last_hydraulic_code?.trim() || null,
  }
}

export function oilDatesSelectFragment(): string {
  return MACHINE_OIL_DATE_FIELDS.join(', ')
}

/** Datum + optionaler Code wie auf dem Aushang (E/I/IB bzw. W) */
export function formatDateWithCode(
  date: string | null | undefined,
  code: string | null | undefined,
  formatDate: (iso: string | null | undefined) => string,
): string {
  const d = formatDate(date ?? null)
  const c = code?.trim()
  if (!c) return d
  if (!date) return c
  return `${d} · ${c}`
}
