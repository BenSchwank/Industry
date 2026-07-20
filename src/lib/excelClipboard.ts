/** Excel-kompatibles Tab-getrenntes Parsing & Export */

export function parseExcelPaste(text: string): string[][] {
  const rows = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((c) => c.trim()))
    .filter((row) => row.some((c) => c.length > 0))

  if (rows.length === 0) return []

  // Kopfzeile aus Excel-Export überspringen
  if (looksLikeHeaderRow(rows[0])) {
    return rows.slice(1)
  }
  return rows
}

function looksLikeHeaderRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase()
  const hits = [
    'scan',
    'bezeichnung',
    'kategorie',
    'standort',
    'status',
    'wartung',
    'garantie',
    'barcode',
    'name',
  ].filter((h) => joined.includes(h))
  return hits.length >= 2
}

export function rowsToTsv(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n')
}

export interface ParsedMachinePaste {
  barcode?: string
  name: string
  category?: string | null
  location: string | null
  status?: string
  last_maintenance_at?: string | null
  next_maintenance_at?: string | null
  last_repair_at?: string | null
  warranty_until?: string | null
}

function parseGermanDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

const STATUS_MAP: Record<string, string> = {
  aktiv: 'active',
  active: 'active',
  wartung: 'maintenance',
  'in wartung': 'maintenance',
  maintenance: 'maintenance',
  offline: 'offline',
  'außer betrieb': 'decommissioned',
  'ausser betrieb': 'decommissioned',
  decommissioned: 'decommissioned',
}

const STATUS_EXPORT: Record<string, string> = {
  active: 'Aktiv',
  maintenance: 'In Wartung',
  offline: 'Offline',
  decommissioned: 'Außer Betrieb',
}

function looksLikeBarcode(s: string): boolean {
  return /^(KWD-M|MCH-)/i.test(s.trim())
}

function looksLikeDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\.\d{1,2}\.\d{4}/.test(s.trim())
}

export function mapPasteRowToMachine(cells: string[]): ParsedMachinePaste | null {
  const nonEmpty = cells.filter(Boolean)
  if (nonEmpty.length === 0) return null

  // Volle Excel-Zeile mit Kategorie: Code | Name | Kategorie | Standort | Status | …
  if (cells.length >= 9 && looksLikeBarcode(cells[0])) {
    const name = cells[1]?.trim()
    if (!name) return null
    const statusAt4 = cells[4] ? STATUS_MAP[cells[4].toLowerCase()] : undefined
    if (statusAt4 || cells[2]?.trim()) {
      return {
        barcode: cells[0],
        name,
        category: cells[2]?.trim() || null,
        location: cells[3]?.trim() || null,
        status: statusAt4,
        last_maintenance_at: parseGermanDate(cells[5] ?? ''),
        next_maintenance_at: parseGermanDate(cells[6] ?? ''),
        last_repair_at: parseGermanDate(cells[7] ?? ''),
        warranty_until: parseGermanDate(cells[8] ?? ''),
      }
    }
  }

  // Volle Excel-Zeile: Code | Name | Standort | Status | Letzte W. | Nächste W. | Reparatur | Garantie
  if (cells.length >= 8 && looksLikeBarcode(cells[0])) {
    const name = cells[1]?.trim()
    if (!name) return null
    return {
      barcode: cells[0],
      name,
      location: cells[2]?.trim() || null,
      status: cells[3] ? STATUS_MAP[cells[3].toLowerCase()] : undefined,
      last_maintenance_at: parseGermanDate(cells[4] ?? ''),
      next_maintenance_at: parseGermanDate(cells[5] ?? ''),
      last_repair_at: parseGermanDate(cells[6] ?? ''),
      warranty_until: parseGermanDate(cells[7] ?? ''),
    }
  }

  if (cells.length >= 4 && looksLikeBarcode(cells[0])) {
    const name = cells[1]?.trim()
    if (!name) return null
    return {
      barcode: cells[0],
      name,
      location: cells[2]?.trim() || null,
      status: cells[3] ? STATUS_MAP[cells[3].toLowerCase()] : undefined,
      warranty_until: cells[4] ? parseGermanDate(cells[4]) : null,
    }
  }

  if (cells.length >= 2) {
    const name = cells[0]?.trim()
    if (!name) return null
    let idx = 1
    const location = cells[idx]?.trim() || null
    if (cells[idx + 1] && looksLikeBarcode(cells[idx + 1])) idx++
    const statusCell = cells[idx + 1]
    const status =
      statusCell && !looksLikeDate(statusCell) ? STATUS_MAP[statusCell.toLowerCase()] : undefined
    const dateStart = status ? idx + 2 : idx + 1
    return {
      name,
      location,
      barcode: cells.find(looksLikeBarcode),
      status,
      last_maintenance_at: parseGermanDate(cells[dateStart] ?? ''),
      next_maintenance_at: parseGermanDate(cells[dateStart + 1] ?? ''),
      last_repair_at: parseGermanDate(cells[dateStart + 2] ?? ''),
      warranty_until: parseGermanDate(cells[dateStart + 3] ?? ''),
    }
  }

  return null
}

export function machinesToTsv(
  machines: {
    barcode: string
    name: string
    category?: string | null
    location: string | null
    status: string
    last_maintenance_at: string | null
    next_maintenance_at: string | null
    last_repair_at: string | null
    warranty_until: string | null
    document_count?: number
    plan_label?: string | null
  }[],
): string {
  const header = [
    'Scan-Code',
    'Bezeichnung',
    'Kategorie',
    'Standort',
    'Status',
    'Dokumente',
    'Plan/Analyse',
    'Letzte Wartung',
    'Nächste Wartung',
    'Letzte Reparatur',
    'Garantie',
  ]
  const rows = machines.map((m) => [
    m.barcode,
    m.name,
    m.category ?? '',
    m.location ?? '',
    STATUS_EXPORT[m.status] ?? m.status,
    m.document_count != null ? String(m.document_count) : '',
    m.plan_label ?? '',
    m.last_maintenance_at ? formatDe(m.last_maintenance_at) : '',
    m.next_maintenance_at ? formatDe(m.next_maintenance_at) : '',
    m.last_repair_at ? formatDe(m.last_repair_at) : '',
    m.warranty_until ? formatDe(m.warranty_until) : '',
  ])
  return rowsToTsv([header, ...rows])
}

function formatDe(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE')
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
