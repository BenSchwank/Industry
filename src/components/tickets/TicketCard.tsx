import {
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
} from '../../hooks/useTicketActions'
import type { TicketListItem } from '../../lib/ticketFilters'
import { ticketDisplayName, ticketDisplaySubtitle } from '../../lib/ticketFilters'
import type { TicketEditTarget } from './TicketEditForm'

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-kwd-muted',
  medium: 'text-kwd-warning',
  high: 'text-kwd-primary',
  critical: 'text-kwd-danger',
}

interface TicketCardProps {
  ticket: TicketListItem
  busy: boolean
  authorName?: string | null
  onEdit: (target: TicketEditTarget) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}

export function TicketCard({
  ticket,
  busy,
  authorName,
  onEdit,
  onResolve,
  onDelete,
}: TicketCardProps) {
  const machine = ticket.machines
  const referenceLabel = ticket.reference_label
  const isFreeReference = !machine && Boolean(referenceLabel?.trim())
  const isOpen = ticket.status === 'open' || ticket.status === 'in_progress'

  return (
    <article className="bg-kwd-surface border-kwd-border rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-kwd-primary text-xs font-bold">{ticketDisplaySubtitle(ticket)}</p>
          <p className="truncate font-semibold">{ticketDisplayName(ticket)}</p>
        </div>
        <span className={`shrink-0 text-xs font-bold uppercase ${PRIORITY_COLORS[ticket.priority]}`}>
          {TICKET_PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
        </span>
      </div>
      <p className="text-kwd-muted mt-2 text-sm">{ticket.description}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="bg-kwd-bg rounded px-2 py-1 font-medium">
          {TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
        </span>
        <span className="text-kwd-muted">
          {authorName && <span className="text-kwd-primary mr-2 font-semibold">{authorName}</span>}
          {new Date(ticket.created_at).toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onEdit({
              id: ticket.id,
              description: ticket.description,
              priority: ticket.priority,
              status: ticket.status,
              machine_id: ticket.machine_id ?? null,
              reference_label: referenceLabel ?? null,
              machine_label: isFreeReference
                ? `Freier Bezug: ${referenceLabel?.trim() ?? ''}`
                : `${machine?.barcode ?? ''} – ${machine?.name ?? ''}`.trim(),
            })
          }
          className="kwd-btn min-h-[44px] px-4 text-sm font-semibold"
        >
          Bearbeiten
        </button>
        {isOpen && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(ticket.id)}
            className="bg-kwd-success min-h-[44px] rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? '…' : 'Erledigt'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(ticket.id)}
          className="border-kwd-danger text-kwd-danger min-h-[44px] rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
        >
          Löschen
        </button>
      </div>
    </article>
  )
}
