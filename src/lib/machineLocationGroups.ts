import type { MachineWithStats } from '../hooks/useMachinesWithStats'

export interface LocationParts {
  hall: string
  detail: string | null
}

/** "Halle 1 / Verzahnung" → Halle: "Halle 1", Detail: "Verzahnung" */
export function parseLocation(location: string | null): LocationParts {
  if (!location?.trim()) return { hall: 'Ohne Standort', detail: null }

  const parts = location
    .split(/\s*[\/\\>|–—-]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length <= 1) return { hall: parts[0] ?? location.trim(), detail: null }

  return {
    hall: parts[0],
    detail: parts.slice(1).join(' · '),
  }
}

export interface MachineLocationGroup {
  hall: string
  machines: MachineWithStats[]
}

export function groupMachinesByHall(machines: MachineWithStats[]): MachineLocationGroup[] {
  const map = new Map<string, MachineWithStats[]>()

  for (const machine of machines) {
    const { hall } = parseLocation(machine.location)
    const list = map.get(hall) ?? []
    list.push(machine)
    map.set(hall, list)
  }

  return Array.from(map.entries())
    .map(([hall, items]) => ({
      hall,
      machines: items.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    }))
    .sort((a, b) => {
      if (a.hall === 'Ohne Standort') return 1
      if (b.hall === 'Ohne Standort') return -1
      return a.hall.localeCompare(b.hall, 'de')
    })
}

export function displayLocationDetail(location: string | null): string {
  const { detail, hall } = parseLocation(location)
  if (!location?.trim()) return '–'
  if (detail) return detail
  return hall
}
