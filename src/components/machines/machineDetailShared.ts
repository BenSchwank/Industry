import type { TimelineItem } from '../../hooks/useMachineLifecycle'
import type { MachineStatus } from '../../types/database'

export type MachineDetailTab =
  | 'overview'
  | 'problems'
  | 'history'
  | 'documents'
  | 'plans'
  | 'knowledge'

export const MACHINE_DETAIL_TABS: {
  id: MachineDetailTab
  label: string
  short: string
}[] = [
  { id: 'overview', label: 'Stammdaten', short: 'Daten' },
  { id: 'problems', label: 'Störungen', short: 'Stör.' },
  { id: 'history', label: 'Lebenszyklus', short: 'Zykl.' },
  { id: 'documents', label: 'Unterlagen', short: 'Docs' },
  { id: 'knowledge', label: 'Wissen', short: 'Wiss.' },
]

export const MACHINE_STATUS_OPTIONS: { value: MachineStatus; label: string }[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'maintenance', label: 'In Wartung' },
  { value: 'offline', label: 'Offline' },
  { value: 'decommissioned', label: 'Außer Betrieb' },
]

export const MACHINE_DETAIL_FIELD_CLS =
  'border-kwd-border bg-kwd-paper text-kwd-text mt-1 min-h-[40px] w-full border px-3 text-sm'

export function formatMachineDetailDate(d: string | null) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('de-DE')
}

export function toMachineDateInput(d: string | null) {
  if (!d) return ''
  return d.slice(0, 10)
}

export function filterMachineTimeline(timeline: TimelineItem[], query: string): TimelineItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return timeline
  const terms = q.split(/\s+/).filter(Boolean)
  return timeline.filter((item) => {
    const haystack = `${item.title} ${item.description ?? ''}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}
