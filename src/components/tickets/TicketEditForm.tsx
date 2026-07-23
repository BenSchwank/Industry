import { useState, type FormEvent } from 'react'
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  useActiveAssignees,
  useUpdateTicket,
} from '../../hooks/useTicketActions'
import { useAuthStore } from '../../stores/authStore'
import type { TicketPriority, TicketStatus } from '../../types/database'

export interface TicketEditTarget {
  id: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  assigned_to?: string | null
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
  const userId = useAuthStore((s) => s.user?.id)
  const { data: assignees = [], isLoading: loadingAssignees } = useActiveAssignees()
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [assignedTo, setAssignedTo] = useState(ticket.assigned_to ?? '')
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

    let nextAssigned = assignedTo.trim() || null
    if (status === 'in_progress' && !nextAssigned) {
      nextAssigned = userId ?? null
      if (!nextAssigned) {
        setError('Für „In Arbeit“ bitte einen Benutzer wählen')
        return
      }
    }
    if (status === 'open' && !assignedTo.trim()) {
      nextAssigned = null
    }

    setError(null)
    try {
      await updateTicket.mutateAsync({
        id: ticket.id,
        description: description.trim(),
        priority,
        status,
        assigned_to: nextAssigned,
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
            onChange={(e) => {
              const next = e.target.value as TicketStatus
              setStatus(next)
              if (next === 'in_progress' && !assignedTo && userId) {
                setAssignedTo(userId)
              }
            }}
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
          <span className="text-kwd-muted text-sm font-medium">
            Zuständig {status === 'in_progress' ? '*' : '(optional)'}
          </span>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            required={status === 'in_progress'}
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4"
          >
            <option value="">
              {loadingAssignees ? 'Lade Benutzer…' : 'Niemand / offen'}
            </option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username}
                {a.id === userId ? ' (ich)' : ''}
              </option>
            ))}
          </select>
          <p className="text-kwd-muted mt-1 text-xs">
            Zeigt in der Liste, wer an der Störung arbeitet.
          </p>
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
