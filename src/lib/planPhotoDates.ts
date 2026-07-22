/** Flexible Datumsparser für Wartungsplan-Fotos („Dez 25“, „Mrz 26“, ISO, de-DE) */

const MONTHS: Record<string, number> = {
  jan: 1,
  januar: 1,
  feb: 2,
  februar: 2,
  mrz: 3,
  mär: 3,
  maer: 3,
  mar: 3,
  märz: 3,
  maerz: 3,
  apr: 4,
  april: 4,
  mai: 5,
  may: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  nov: 11,
  november: 11,
  dez: 12,
  december: 12,
  dec: 12,
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Rohtext vom Plan → ISO-Datum (YYYY-MM-DD) oder null */
export function parsePlanFlexibleDate(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t || t === '-' || t === '–' || t === '—') return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t

  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (de) {
    const d = Number(de[1])
    const m = Number(de[2])
    let y = Number(de[3])
    if (y < 100) y += 2000
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${y}-${pad2(m)}-${pad2(d)}`
  }

  const monYear = t.match(/^([A-Za-zÄÖÜäöüß.]+)\s*['’]?\s*(\d{2}|\d{4})$/)
  if (monYear) {
    const key = monYear[1].replace(/\./g, '').toLowerCase()
    const month = MONTHS[key]
    if (!month) return null
    let y = Number(monYear[2])
    if (y < 100) y += 2000
    return `${y}-${pad2(month)}-01`
  }

  const parsed = Date.parse(t)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  return null
}

/** Anzeige in der Vorschau: ISO → kurz de, sonst Rohtext */
export function displayPlanDate(isoOrRaw: string | null | undefined): string {
  const t = isoOrRaw?.trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-')
    return `${d}.${m}.${y}`
  }
  return t
}
