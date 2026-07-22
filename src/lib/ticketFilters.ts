import {
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
} from '../hooks/useTicketActions'
import type { TicketPriority, TicketStatus } from '../types/database'

export type TicketStatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriorityFilter = 'all' | TicketPriority

export interface TicketListItem {
  id: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  created_at: string
  created_by: string | null
  reference_label?: string | null
  machine_id?: string | null
  machines: { name: string; barcode: string } | null
}

export const PRIORITY_ORDER: TicketPriority[] = ['critical', 'high', 'medium', 'low']

export const PRIORITY_SECTION_CLS: Record<TicketPriority, string> = {
  critical: 'border-kwd-danger/50 bg-kwd-danger/5',
  high: 'border-kwd-primary/40 bg-kwd-primary/5',
  medium: 'border-kwd-warning/40 bg-kwd-warning/5',
  low: 'border-kwd-border bg-kwd-surface/50',
}

function startOfDay(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function endOfDay(isoDate: string) {
  const d = new Date(`${isoDate}T23:59:59.999`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function ticketDisplayName(ticket: TicketListItem): string {
  const machine = ticket.machines
  const ref = ticket.reference_label?.trim()
  if (machine?.name) return machine.name
  if (ref) return ref
  return 'Unbekannter Bezug'
}

export function ticketDisplaySubtitle(ticket: TicketListItem): string {
  const machine = ticket.machines
  const ref = ticket.reference_label?.trim()
  if (!machine && ref) return 'Freier Bezug'
  return machine?.barcode ?? '–'
}

export function filterTickets(
  tickets: TicketListItem[],
  opts: {
    searchQuery: string
    statusFilter: TicketStatusFilter
    priorityFilter: TicketPriorityFilter
    dateFrom: string
    dateTo: string
  },
): TicketListItem[] {
  const terms = opts.searchQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const from = opts.dateFrom ? startOfDay(opts.dateFrom) : null
  const to = opts.dateTo ? endOfDay(opts.dateTo) : null

  return tickets.filter((t) => {
    if (opts.statusFilter === 'open') {
      if (t.status !== 'open' && t.status !== 'in_progress') return false
    } else if (opts.statusFilter !== 'all' && t.status !== opts.statusFilter) {
      return false
    }

    if (opts.priorityFilter !== 'all' && t.priority !== opts.priorityFilter) return false

    const created = new Date(t.created_at)
    if (from && created < from) return false
    if (to && created > to) return false

    if (terms.length > 0) {
      const haystack = [
        t.description,
        t.reference_label ?? '',
        t.machines?.name ?? '',
        t.machines?.barcode ?? '',
        TICKET_STATUS_LABEL[t.status] ?? t.status,
        TICKET_PRIORITY_LABEL[t.priority] ?? t.priority,
      ]
        .join(' ')
        .toLowerCase()
      if (!terms.every((term) => haystack.includes(term))) return false
    }

    return true
  })
}

export function groupTicketsByPriority(
  tickets: TicketListItem[],
): { priority: TicketPriority; tickets: TicketListItem[] }[] {
  const map = new Map<TicketPriority, TicketListItem[]>()
  for (const p of PRIORITY_ORDER) map.set(p, [])
  for (const t of tickets) {
    const list = map.get(t.priority)
    if (list) list.push(t)
    else map.set(t.priority, [t])
  }
  return PRIORITY_ORDER.map((priority) => ({
    priority,
    tickets: map.get(priority) ?? [],
  })).filter((g) => g.tickets.length > 0)
}

export function isoDateDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}
