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
  const set = new Set<string>()
  for (const v of extra) {
    const t = v.trim()
    if (t) set.add(t)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
}

export interface MachineCategoryGroup {
  key: string
  label: string
  machines: MachineWithStats[]
}

/** Gruppen wie früher die Hallen – Reihenfolge der Maschinen bleibt erhalten */
export function groupMachinesByCategory(
  machines: MachineWithStats[],
  options?: { sortGroups?: boolean; descending?: boolean },
): MachineCategoryGroup[] {
  const order: string[] = []
  const map = new Map<string, MachineWithStats[]>()

  for (const machine of machines) {
    const key = machine.category?.trim() || UNCATEGORIZED_LABEL
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(machine)
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

  return keys.map((key) => ({
    key,
    label: key,
    machines: map.get(key) ?? [],
  }))
}
