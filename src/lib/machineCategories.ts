/** Vorgegebene Kategorien für Maschinen / Geräte / Kräne (nur Vorschläge – Freitext erlaubt) */
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

/** Vorgaben + bereits genutzte Kategorien für Autocomplete */
export function machineCategorySuggestions(extra: Iterable<string> = []): string[] {
  const set = new Set<string>(MACHINE_CATEGORIES)
  for (const v of extra) {
    const t = v.trim()
    if (t) set.add(t)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
}

/** id für gemeinsames <datalist> in Tabellen */
export const MACHINE_CATEGORY_DATALIST_ID = 'kwd-machine-category-suggestions'
