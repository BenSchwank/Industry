import type { MachineWithStats } from '../hooks/useMachinesWithStats'

/** Keine festen Vorlagen – Kategorien entstehen nur durch eigene Eingaben */
export const MACHINE_CATEGORY_DATALIST_ID = 'kwd-machine-category-suggestions'

export const UNCATEGORIZED_LABEL = 'Ohne Kategorie'

export function formatMachineCategory(value: string | null | undefined): string {
  if (!value?.trim()) return UNCATEGORIZED_LABEL
  return value.trim()
}

/** Nur selbst angelegte / bereits genutzte Werte als Vorschlag */
export function machineCategorySuggestions(extra: Iterable<string> = []): string[] {
  const byLower = new Map<string, string>()
  for (const v of extra) {
    const t = v.trim()
    if (!t || t.toLowerCase() === UNCATEGORIZED_LABEL.toLowerCase()) continue
    const lower = t.toLowerCase()
    if (!byLower.has(lower)) byLower.set(lower, t)
  }
  return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b, 'de'))
}

/** Kanonischen Ordnernamen finden (Groß/Klein egal) */
export function resolveCategoryKey(
  value: string | null | undefined,
  known: Iterable<string> = [],
): string {
  const raw = value?.trim() || ''
  if (!raw || raw.toLowerCase() === UNCATEGORIZED_LABEL.toLowerCase()) {
    return UNCATEGORIZED_LABEL
  }
  const lower = raw.toLowerCase()
  for (const k of known) {
    const t = k.trim()
    if (t && t.toLowerCase() === lower) return t
  }
  return raw
}

export interface MachineCategoryGroup {
  key: string
  label: string
  machines: MachineWithStats[]
}

/** Gruppen wie früher die Hallen – Reihenfolge der Maschinen bleibt erhalten */
export function groupMachinesByCategory(
  machines: MachineWithStats[],
  options?: {
    sortGroups?: boolean
    descending?: boolean
    /** Auch leere Ordner anzeigen (neu angelegte Kategorien) */
    ensureCategories?: Iterable<string>
  },
): MachineCategoryGroup[] {
  const ensure = [...(options?.ensureCategories ?? [])]
    .map((c) => c.trim())
    .filter((c) => c && c.toLowerCase() !== UNCATEGORIZED_LABEL.toLowerCase())

  const knownKeys = new Map<string, string>()
  for (const c of ensure) {
    const lower = c.toLowerCase()
    if (!knownKeys.has(lower)) knownKeys.set(lower, c)
  }
  for (const machine of machines) {
    const raw = machine.category?.trim()
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (lower === UNCATEGORIZED_LABEL.toLowerCase()) continue
    if (!knownKeys.has(lower)) knownKeys.set(lower, raw)
  }

  const order: string[] = []
  const map = new Map<string, MachineWithStats[]>()

  function ensureBucket(key: string) {
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
  }

  for (const machine of machines) {
    const key = resolveCategoryKey(machine.category, knownKeys.values())
    ensureBucket(key)
    map.get(key)!.push(machine)
  }

  for (const raw of ensure) {
    const key = resolveCategoryKey(raw, knownKeys.values())
    if (key === UNCATEGORIZED_LABEL) continue
    ensureBucket(key)
  }

  const sortGroups = options?.sortGroups ?? true
  const descending = options?.descending ?? false

  const keys = sortGroups
    ? [...order].sort((a, b) => {
        if (a === UNCATEGORIZED_LABEL) return 1
        if (b === UNCATEGORIZED_LABEL) return -1
        const c = a.localeCompare(b, 'de')
        return descending ? -c : c
      })
    : order

  // Leere Liste: mindestens einen Ordner zum Anlegen anzeigen
  if (keys.length === 0) {
    keys.push(UNCATEGORIZED_LABEL)
    map.set(UNCATEGORIZED_LABEL, [])
  }

  return keys.map((key) => ({
    key,
    label: key,
    machines: map.get(key) ?? [],
  }))
}
