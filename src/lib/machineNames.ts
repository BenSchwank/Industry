/** Anzeigename (Zeichnung/Menü) vs. Datenname (Lebenszyklus) */

export function machineDataName(machine: { name: string }): string {
  return machine.name.trim()
}

/** Name für Listen/Menü – Etikett wenn gesetzt, sonst Datenname */
export function machineMenuName(machine: {
  name: string
  label_name?: string | null
}): string {
  const label = machine.label_name?.trim()
  return label || machine.name.trim()
}

/** Beide Namen für Suche / Anzeige-Hinweis */
export function machineNameSearchText(machine: {
  name: string
  label_name?: string | null
}): string {
  const data = machine.name.trim()
  const label = machine.label_name?.trim()
  if (!label || label.toLowerCase() === data.toLowerCase()) return data
  return `${label} ${data}`
}
