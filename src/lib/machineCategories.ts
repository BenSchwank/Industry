/** Vorgegebene Kategorien für Maschinen / Geräte / Kräne */
export const MACHINE_CATEGORIES = [
  'Maschine',
  'Gerät',
  'Kran',
  'Anlage',
  'Werkzeug',
  'Sonstiges',
] as const

export type MachineCategory = (typeof MACHINE_CATEGORIES)[number]

export function isMachineCategory(value: string | null | undefined): value is MachineCategory {
  return Boolean(value && (MACHINE_CATEGORIES as readonly string[]).includes(value))
}

export function formatMachineCategory(value: string | null | undefined): string {
  if (!value?.trim()) return '–'
  return value.trim()
}
