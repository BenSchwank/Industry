/** id für gemeinsames <datalist> Standort in der Maschinenliste */
export const MACHINE_LOCATION_DATALIST_ID = 'kwd-machine-location-suggestions'

/** Bereits verwendete Standorte als Vorschläge (Freitext bleibt erlaubt) */
export function machineLocationSuggestions(extra: Iterable<string> = []): string[] {
  const set = new Set<string>()
  for (const v of extra) {
    const t = v.trim()
    if (t) set.add(t)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
}
