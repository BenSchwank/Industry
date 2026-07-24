export type AppView =
  | 'overview'
  | 'scanner'
  | 'machines'
  | 'inventory'
  | 'tickets'
  | 'maintenance'
  | 'messages'
  | 'chat'
  | 'notes'
  | 'import'
  | 'users'
  | 'settings'
  | 'more'

export const DESKTOP_NAV: { view: AppView; label: string }[] = [
  { view: 'overview', label: 'Übersicht' },
  { view: 'scanner', label: 'Scanner' },
  { view: 'machines', label: 'Maschinen' },
  { view: 'inventory', label: 'Lager' },
  { view: 'tickets', label: 'Störungen' },
  { view: 'maintenance', label: 'Reparaturen' },
  { view: 'chat', label: 'Team-Chat' },
  { view: 'notes', label: 'Notizen' },
  { view: 'messages', label: 'Hinweise / Fälligkeiten' },
  { view: 'import', label: 'QS1 Import' },
]

/** Nur sichtbar für aktive Admins */
export const ADMIN_NAV: { view: AppView; label: string }[] = [
  { view: 'users', label: 'Nutzerverwaltung' },
]
