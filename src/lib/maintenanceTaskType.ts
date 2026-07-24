/** Erkennung HU-Aufgabe (bis Spalte task_type existiert). */
export function isHuTaskTitle(title: string | null | undefined): boolean {
  return /hauptuntersuchung|^hu\b/i.test(title ?? '')
}

export type MaintenanceSectionFilter = 'all' | 'hu' | 'repair' | 'open' | 'linked'
