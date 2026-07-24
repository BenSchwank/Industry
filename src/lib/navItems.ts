export type AppView =
  | 'overview'
  | 'scanner'
  | 'machines'
  | 'inventory'
  | 'tickets'
  | 'maintenance'
  | 'messages'
  | 'chat'
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
  { view: 'messages', label: 'Nachrichten' },
  { view: 'chat', label: 'Chat' },
  { view: 'import', label: 'QS1 Import' },
]

/** Nur sichtbar für aktive Admins */
export const ADMIN_NAV: { view: AppView; label: string }[] = [
  { view: 'users', label: 'Nutzerverwaltung' },
]
