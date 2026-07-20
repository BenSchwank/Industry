/** QS1 / CSV Import – flexible Spalten-Erkennung (deutsch) */

export interface QS1ImportRow {
  externalId: string
  machineName: string
  location: string | null
  taskTitle: string
  frequencyDays: number
  nextDueDate: string
  checklistItems: string[]
  raw: Record<string, string>
}

export interface QS1ParseResult {
  rows: QS1ImportRow[]
  headers: string[]
  delimiter: string
  errors: string[]
}

const COLUMN_ALIASES: Record<keyof Omit<QS1ImportRow, 'raw' | 'checklistItems'>, string[]> = {
  externalId: [
    'inventarnummer',
    'objektnummer',
    'equipment',
    'equipment_id',
    'prüfmittel',
    'pruefmittel',
    'nummer',
    'id',
    'barcode',
    'code',
  ],
  machineName: ['bezeichnung', 'objektname', 'name', 'maschine', 'anlage', 'gerät', 'geraet'],
  location: ['standort', 'ort', 'halle', 'einsatzort', 'location'],
  taskTitle: ['wartung', 'betreff', 'tätigkeit', 'taetigkeit', 'aufgabe', 'plan', 'wartungsplan', 'title'],
  frequencyDays: [
    'intervall_tage',
    'intervall',
    'intervall tage',
    'frequenz',
    'zyklus',
    'frequency_days',
    'tage',
  ],
  nextDueDate: [
    'nächster_termin',
    'naechster_termin',
    'nächster termin',
    'faellig',
    'fällig',
    'faellig_am',
    'fällig_am',
    'next_due',
    'termin',
    'datum',
  ],
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function detectDelimiter(line: string): string {
  const counts = [
    { d: ';', c: (line.match(/;/g) ?? []).length },
    { d: '\t', c: (line.match(/\t/g) ?? []).length },
    { d: ',', c: (line.match(/,/g) ?? []).length },
  ]
  counts.sort((a, b) => b.c - a.c)
  return counts[0]?.c > 0 ? counts[0].d : ';'
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === delimiter) {
      result.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  result.push(current.trim())
  return result
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader)
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias)
    if (idx >= 0) return idx
  }
  for (let i = 0; i < normalized.length; i++) {
    if (aliases.some((a) => normalized[i].includes(a) || a.includes(normalized[i]))) return i
  }
  return -1
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)

  const de = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (de) {
    return `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`
  }

  const d = new Date(trimmed)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function parseChecklist(raw: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(/[|;]|(?:\s*\/\s*)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseIntervalDays(raw: string): number {
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10)
  if (Number.isNaN(n) || n <= 0) return 30
  if (raw.toLowerCase().includes('monat')) return 30
  if (raw.toLowerCase().includes('jahr')) return 365
  if (raw.toLowerCase().includes('woche')) return 7
  return n
}

export function parseQS1Csv(content: string): QS1ParseResult {
  const errors: string[] = []
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

  if (lines.length < 2) {
    return { rows: [], headers: [], delimiter: ';', errors: ['Datei leer oder nur Kopfzeile.'] }
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter)

  const col = {
    externalId: findColumn(headers, COLUMN_ALIASES.externalId),
    machineName: findColumn(headers, COLUMN_ALIASES.machineName),
    taskTitle: findColumn(headers, COLUMN_ALIASES.taskTitle),
    location: findColumn(headers, COLUMN_ALIASES.location),
    frequencyDays: findColumn(headers, COLUMN_ALIASES.frequencyDays),
    nextDueDate: findColumn(headers, COLUMN_ALIASES.nextDueDate),
  }

  const checklistCol = headers.findIndex((h) =>
    /check|prüf|pruef|punkte|schritte/i.test(h),
  )

  if (col.externalId < 0) errors.push('Spalte Inventarnummer/Objektnummer nicht erkannt.')
  if (col.machineName < 0) errors.push('Spalte Bezeichnung/Name nicht erkannt.')
  if (col.taskTitle < 0) errors.push('Spalte Wartung/Betreff nicht erkannt.')

  const rows: QS1ImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter)
    const raw: Record<string, string> = {}
    headers.forEach((h, idx) => {
      raw[h] = cells[idx] ?? ''
    })

    const externalId = col.externalId >= 0 ? cells[col.externalId]?.trim() : ''
    const machineName = col.machineName >= 0 ? cells[col.machineName]?.trim() : ''
    const taskTitle = col.taskTitle >= 0 ? cells[col.taskTitle]?.trim() : ''

    if (!externalId && !machineName) continue

    const nextDue =
      col.nextDueDate >= 0 ? parseDate(cells[col.nextDueDate] ?? '') : null

    rows.push({
      externalId: externalId || `QS1-${i}`,
      machineName: machineName || externalId,
      location: col.location >= 0 ? cells[col.location]?.trim() || null : null,
      taskTitle: taskTitle || 'Wartung',
      frequencyDays:
        col.frequencyDays >= 0 ? parseIntervalDays(cells[col.frequencyDays] ?? '30') : 30,
      nextDueDate: nextDue ?? new Date().toISOString().slice(0, 10),
      checklistItems:
        checklistCol >= 0 ? parseChecklist(cells[checklistCol] ?? '') : [],
      raw,
    })
  }

  return { rows, headers, delimiter, errors }
}
