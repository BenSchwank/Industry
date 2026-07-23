/** Barcode-System für Maschinen & Lager – einheitlich für Scan-Routing */

export const BARCODE_PREFIX = {
  machine: 'KWD-M',
  inventory: 'KWD-L',
} as const

export type BarcodeEntityType = keyof typeof BARCODE_PREFIX

/** Normalisiert Eingabe: trim, uppercase, mehrfache Bindestriche entfernen */
export function normalizeBarcode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Prüft ob Code scanbar/gültig ist (3–32 Zeichen, A-Z 0-9 Bindestrich) */
export function validateBarcode(code: string): { valid: boolean; error?: string } {
  const normalized = normalizeBarcode(code)
  if (normalized.length < 3) {
    return { valid: false, error: 'Mindestens 3 Zeichen erforderlich.' }
  }
  if (normalized.length > 32) {
    return { valid: false, error: 'Maximal 32 Zeichen erlaubt.' }
  }
  if (!/^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$|^[A-Z0-9]{1,2}$/.test(normalized)) {
    return {
      valid: false,
      error: 'Nur Buchstaben, Zahlen und Bindestriche. Muss mit Buchstabe/Zahl beginnen.',
    }
  }
  return { valid: true }
}

/** Vorschlag für neuen Maschinen-Code basierend auf Name */
export function suggestMachineBarcode(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[ÄÀÁÂ]/g, 'AE')
    .replace(/[ÖÒÓÔ]/g, 'OE')
    .replace(/[ÜÙÚÛ]/g, 'UE')
    .replace(/ẞ/g, 'SS')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 16)

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    .toUpperCase()
    .slice(-8)
  return normalizeBarcode(`${BARCODE_PREFIX.machine}-${slug || 'NEU'}-${suffix}`)
}

/** Vorschlag für Lagerartikel-Code */
export function suggestInventoryBarcode(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[ÄÀÁÂ]/g, 'AE')
    .replace(/[ÖÒÓÔ]/g, 'OE')
    .replace(/[ÜÙÚÛ]/g, 'UE')
    .replace(/ẞ/g, 'SS')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 16)

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    .toUpperCase()
    .slice(-8)
  return normalizeBarcode(`${BARCODE_PREFIX.inventory}-${slug || 'ARTIKEL'}-${suffix}`)
}

/** Erkennt Entitätstyp am Präfix (für schnelles Routing ohne DB) */
export function detectEntityType(code: string): BarcodeEntityType | 'unknown' {
  const n = normalizeBarcode(code)
  if (n.startsWith(`${BARCODE_PREFIX.inventory}-`) || n.startsWith('LAG-')) {
    return 'inventory'
  }
  if (n.startsWith(`${BARCODE_PREFIX.machine}-`) || n.startsWith('MCH-')) {
    return 'machine'
  }
  return 'unknown'
}
