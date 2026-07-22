import { useState, type FormEvent } from 'react'
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  useUpdateTicket,
} from '../../hooks/useTicketActions'
import type { TicketPriority, TicketStatus } from '../../types/database'

export interface TicketEditTarget {
  id: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  machine_id?: string | null
  reference_label?: string | null
  machine_label?: string
}

interface TicketEditFormProps {
  ticket: TicketEditTarget
  onClose: () => void
  onSuccess: (message: string) => void
}

export function TicketEditForm({ ticket, onClose, onSuccess }: TicketEditFormProps) {
  const updateTicket = useUpdateTicket()
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [referenceLabel, setReferenceLabel] = useState(ticket.reference_label ?? '')
  const [error, setError] = useState<string | null>(null)

  const isFreeReference = !ticket.machine_id

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) {
      setError('Beschreibung ist erforderlich')
      return
    }
    if (isFreeReference && !referenceLabel.trim()) {
      setError('Bezugspunkt ist erforderlich')
      return
    }

    setError(null)
    try {
      await updateTicket.mutateAsync({
        id: ticket.id,
        description: description.trim(),
        priority,
        status,
        ...(isFreeReference ? { reference_label: referenceLabel.trim() } : {}),
      })
      onSuccess('Störung gespeichert.')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">Störung bearbeiten</h3>
        {ticket.machine_label && (
          <p className="text-kwd-muted mt-1 text-sm">{ticket.machine_label}</p>
        )}

        {isFreeReference && (
          <label className="mt-4 block">
            <span className="text-kwd-muted text-sm font-medium">Bezugspunkt</span>
            <input
              type="text"
              value={referenceLabel}
              onChange={(e) => setReferenceLabel(e.target.value)}
              required
              className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Priorität</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4"
          >
            {TICKET_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TicketStatus)}
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4"
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Beschreibung</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={5}
            className="bg-kwd-bg border-kwd-surface-light mt-1 w-full rounded-xl border px-4 py-3 text-base"
          />
        </label>

        {error && <p className="text-kwd-danger mt-3 text-sm font-medium">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-kwd-surface-light min-h-[48px] flex-1 rounded-xl font-semibold"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={updateTicket.isPending}
            className="bg-kwd-primary text-kwd-bg min-h-[48px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {updateTicket.isPending ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}
