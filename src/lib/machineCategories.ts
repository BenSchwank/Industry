import type { MachineWithStats } from '../hooks/useMachinesWithStats'

/** Kategorien aus dem Wartungsplan + eigene / bereits genutzte Werte */
export const MACHINE_CATEGORY_DATALIST_ID = 'kwd-machine-category-suggestions'

export const UNCATEGORIZED_LABEL = 'Ohne Kategorie'

/**
 * Ordner aus dem KWD-Wartungsplan (Aushang).
 * Reihenfolge wie auf dem Plan (oben → unten).
 * Werden mit bestehenden Kategorien gemischt – gleicher Name = kanonisch überschreiben.
 * App-Seiten (Maschinen, Störungen, …) bleiben unverändert.
 */
export const DEFAULT_MACHINE_CATEGORIES = [
  'Pfauter',
  'Kompressoren',
  'DGS KSS',
  'WEMA',
  'Farbanlagen',
  'Hänel',
] as const

/** Namensmuster → Wartungsplan-Ordner (für Import / Vorschlag) */
const CATEGORY_NAME_HINTS: { match: RegExp; category: (typeof DEFAULT_MACHINE_CATEGORIES)[number] }[] =
  [
    { match: /\bpfauter\b/i, category: 'Pfauter' },
    { match: /\b(kompressor|kompressoren|ga\d|trockner|dryer)\b/i, category: 'Kompressoren' },
    { match: /\bdgs\b|\bkss\b/i, category: 'DGS KSS' },
    { match: /\bwema\b/i, category: 'WEMA' },
    { match: /\bfarb\b/i, category: 'Farbanlagen' },
    { match: /\bhänel\b|\bhaenel\b|\bhanel\b|lean\s*lift|multi\s*space/i, category: 'Hänel' },
  ]

export function formatMachineCategory(value: string | null | undefined): string {
  if (!value?.trim()) return UNCATEGORIZED_LABEL
  return value.trim()
}

/** Kanonischen Wartungsplan-Namen, wenn Schreibweise nur Groß/Klein abweicht */
export function canonicalDefaultCategory(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  for (const d of DEFAULT_MACHINE_CATEGORIES) {
    if (d.toLowerCase() === lower) return d
  }
  return null
}

/** Aus Maschinenname den Wartungsplan-Ordner raten */
export function inferCategoryFromMachineName(name: string | null | undefined): string | null {
  const n = name?.trim()
  if (!n) return null
  for (const hint of CATEGORY_NAME_HINTS) {
    if (hint.match.test(n)) return hint.category
  }
  return null
}

/** Nur selbst angelegte / bereits genutzte Werte als Vorschlag (+ Wartungsplan-Defaults) */
export function machineCategorySuggestions(extra: Iterable<string> = []): string[] {
  const byLower = new Map<string, string>()

  // Defaults zuerst → gleicher Name aus Extra behält kanonische Schreibweise
  for (const v of DEFAULT_MACHINE_CATEGORIES) {
    byLower.set(v.toLowerCase(), v)
  }
  for (const v of extra) {
    const t = v.trim()
    if (!t || t.toLowerCase() === UNCATEGORIZED_LABEL.toLowerCase()) continue
    const lower = t.toLowerCase()
    // Gleicher Name wie Default → Default-Schreibweise behalten (überschreiben)
    if (canonicalDefaultCategory(t)) continue
    if (!byLower.has(lower)) byLower.set(lower, t)
  }

  // Wartungsplan-Reihenfolge zuerst, danach übrige A–Z
  const defaults = DEFAULT_MACHINE_CATEGORIES.filter((d) => byLower.has(d.toLowerCase()))
  const rest = Array.from(byLower.values())
    .filter((v) => !canonicalDefaultCategory(v))
    .sort((a, b) => a.localeCompare(b, 'de'))
  return [...defaults, ...rest]
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
  const canon = canonicalDefaultCategory(raw)
  if (canon) return canon
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

function defaultCategoryRank(key: string): number {
  const idx = DEFAULT_MACHINE_CATEGORIES.findIndex((d) => d.toLowerCase() === key.toLowerCase())
  return idx >= 0 ? idx : -1
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
    if (!knownKeys.has(lower)) knownKeys.set(lower, canonicalDefaultCategory(c) ?? c)
  }
  for (const machine of machines) {
    const raw = machine.category?.trim()
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (lower === UNCATEGORIZED_LABEL.toLowerCase()) continue
    if (!knownKeys.has(lower)) knownKeys.set(lower, canonicalDefaultCategory(raw) ?? raw)
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
        const ra = defaultCategoryRank(a)
        const rb = defaultCategoryRank(b)
        if (ra >= 0 || rb >= 0) {
          if (ra < 0) return 1
          if (rb < 0) return -1
          const c = ra - rb
          return descending ? -c : c
        }
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
