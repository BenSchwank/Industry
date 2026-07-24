import {
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
} from '../../hooks/useTicketActions'
import { useTicketPhotos } from '../../hooks/useTicketPhotos'
import type { TicketListItem } from '../../lib/ticketFilters'
import { ticketDisplayName, ticketDisplaySubtitle } from '../../lib/ticketFilters'
import { TicketPhotoPicker, TicketPhotoStrip } from '../machines/LifecyclePhotos'
import type { TicketEditTarget } from './TicketEditForm'

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-kwd-muted',
  medium: 'text-kwd-warning',
  high: 'text-kwd-primary',
  critical: 'text-kwd-danger',
}

interface TicketDetailModalProps {
  ticket: TicketListItem
  busy: boolean
  authorName?: string | null
  assigneeName?: string | null
  onClose: () => void
  onEdit: (target: TicketEditTarget) => void
  onPromoteToRepair?: (ticket: TicketListItem) => void
  onSetInProgress: (ticket: TicketListItem) => void
  onClearInProgress: (id: string) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}

/** Vergrößerte Störungs-Ansicht: Details, Fotos ansehen & anhängen */
export function TicketDetailModal({
  ticket,
  busy,
  authorName,
  assigneeName,
  onClose,
  onEdit,
  onPromoteToRepair,
  onSetInProgress,
  onClearInProgress,
  onResolve,
  onDelete,
}: TicketDetailModalProps) {
  const { data: photos = [], refetch } = useTicketPhotos(ticket.id)
  const machine = ticket.machines
  const referenceLabel = ticket.reference_label
  const isFreeReference = !machine && Boolean(referenceLabel?.trim())
  const isOpen = ticket.status === 'open' || ticket.status === 'in_progress'
  const inProgress = ticket.status === 'in_progress'
  const canPromote = Boolean(onPromoteToRepair && isOpen)

  function openEdit() {
    onEdit({
      id: ticket.id,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      assigned_to: ticket.assigned_to ?? null,
      machine_id: ticket.machine_id ?? null,
      reference_label: referenceLabel ?? null,
      machine_label: isFreeReference
        ? `Freier Bezug: ${referenceLabel?.trim() ?? ''}`
        : `${machine?.barcode ?? ''} – ${machine?.name ?? ''}`.trim(),
    })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-label="Störung Details"
      onClick={onClose}
    >
      <div
        className="bg-kwd-surface border-kwd-border flex max-h-[94svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-kwd-border flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-kwd-primary text-xs font-bold">{ticketDisplaySubtitle(ticket)}</p>
            <h3 className="text-lg font-semibold tracking-tight">{ticketDisplayName(ticket)}</h3>
            <p className="text-kwd-muted mt-0.5 text-xs">
              {authorName && <span className="text-kwd-primary mr-2 font-semibold">{authorName}</span>}
              {new Date(ticket.created_at).toLocaleString('de-DE')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`text-xs font-bold uppercase ${PRIORITY_COLORS[ticket.priority]}`}>
              {TICKET_PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
            </span>
            <button type="button" className="kwd-btn px-2.5" onClick={onClose} aria-label="Schließen">
              ✕
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded px-2 py-1 font-medium ${
                inProgress ? 'bg-kwd-primary/15 text-kwd-primary' : 'bg-kwd-bg text-kwd-text'
              }`}
            >
              {TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
            </span>
            {assigneeName && (
              <span className="bg-kwd-primary/10 text-kwd-primary rounded px-2 py-1 font-semibold">
                Zuständig: {assigneeName}
              </span>
            )}
          </div>

          <section className="mb-5">
            <h4 className="text-kwd-muted mb-1 text-[11px] font-semibold tracking-wide uppercase">
              Beschreibung
            </h4>
            <p className="text-kwd-text whitespace-pre-wrap text-sm leading-relaxed">
              {ticket.description || '—'}
            </p>
          </section>

          <section>
            <h4 className="text-kwd-muted mb-1 text-[11px] font-semibold tracking-wide uppercase">
              Fotos
            </h4>
            <p className="text-kwd-muted mb-2 text-[11px]">
              Antippen zum Vergrößern · Fotos anhängen möglich
            </p>
            {photos.length > 0 ? (
              <TicketPhotoStrip photos={photos} canDelete size="lg" />
            ) : (
              <p className="text-kwd-muted mb-2 text-sm">Noch keine Fotos.</p>
            )}
            <TicketPhotoPicker
              ticketId={ticket.id}
              machineId={ticket.machine_id ?? null}
              onUploaded={() => void refetch()}
            />
          </section>
        </div>

        <footer className="border-kwd-border flex shrink-0 flex-wrap gap-2 border-t px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={openEdit}
            className="kwd-btn min-h-[44px] px-4 text-sm font-semibold"
          >
            Bearbeiten
          </button>
          {canPromote && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPromoteToRepair?.(ticket)}
              className="border-kwd-primary text-kwd-primary min-h-[44px] rounded-lg border px-4 text-sm font-bold disabled:opacity-50"
            >
              Nach Reparaturen
            </button>
          )}
          {isOpen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSetInProgress(ticket)}
              className="border-kwd-primary text-kwd-primary min-h-[44px] rounded-lg border px-4 text-sm font-bold disabled:opacity-50"
            >
              {inProgress ? 'Zuständig ändern' : 'In Arbeit'}
            </button>
          )}
          {inProgress && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onClearInProgress(ticket.id)}
              className="bg-kwd-bg border-kwd-border text-kwd-muted min-h-[44px] rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
            >
              Freigeben
            </button>
          )}
          {isOpen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(ticket.id)}
              className="bg-kwd-success min-h-[44px] rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              Erledigt
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
          <button type="button" onClick={onClose} className="kwd-btn ml-auto min-h-[44px] px-4">
            Schließen
          </button>
        </footer>
      </div>
    </div>
  )
}
