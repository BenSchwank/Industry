import { useState, type FormEvent } from 'react'
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  useActiveAssignees,
  useUpdateTicket,
} from '../../hooks/useTicketActions'
import {
  isPlannedRepairTicket,
  stripPlannedRepairMarker,
  withPlannedRepairMarker,
} from '../../lib/plannedRepairTicket'
import { supabase } from '../../lib/supabase'
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
  /** Verknüpfte geplante Reparatur – Termin bearbeiten */
  lifecycle_entry_id?: string | null
  planned_due_date?: string | null
}

interface TicketEditFormProps {
  ticket: TicketEditTarget
  onClose: () => void
  onSuccess: (message: string) => void
}

function parsePlannedDueFromDescription(description: string): string {
  const m = description.match(/Geplanter Termin:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return ''
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function stripPlannedDueLine(description: string): string {
  return description
    .split('\n')
    .filter((line) => !/^\s*Geplanter Termin:/i.test(line.trim()))
    .join('\n')
    .trim()
}

export function TicketEditForm({ ticket, onClose, onSuccess }: TicketEditFormProps) {
  const updateTicket = useUpdateTicket()
  const userId = useAuthStore((s) => s.user?.id)
  const { data: assignees = [], isLoading: loadingAssignees } = useActiveAssignees()
  const isFreeReference = !ticket.machine_id
  const isPlanned =
    isPlannedRepairTicket(ticket.description) || Boolean(ticket.lifecycle_entry_id)

  const initialDesc = isPlanned
    ? stripPlannedDueLine(stripPlannedRepairMarker(ticket.description))
    : ticket.description

  const [description, setDescription] = useState(initialDesc)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [assignedTo, setAssignedTo] = useState(ticket.assigned_to ?? '')
  const [referenceLabel, setReferenceLabel] = useState(ticket.reference_label ?? '')
  const [plannedDue, setPlannedDue] = useState(
    ticket.planned_due_date?.slice(0, 10) ||
      parsePlannedDueFromDescription(ticket.description) ||
      '',
  )
  const [error, setError] = useState<string | null>(null)

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
    if (status === 'open') {
      nextAssigned = assignedTo.trim() || null
    }

    setError(null)
    try {
      let nextDescription = description.trim()
      if (isPlanned) {
        const due = plannedDue.trim()
        const parts = [nextDescription]
        if (due) {
          parts.push(
            `Geplanter Termin: ${new Date(`${due}T12:00:00`).toLocaleDateString('de-DE')}`,
          )
        }
        nextDescription = isFreeReference
          ? withPlannedRepairMarker(parts.join('\n'))
          : parts.join('\n')
      }

      await updateTicket.mutateAsync({
        id: ticket.id,
        description: nextDescription,
        priority,
        status,
        assigned_to: nextAssigned,
        ...(isFreeReference ? { reference_label: referenceLabel.trim() } : {}),
      })

      if (ticket.lifecycle_entry_id) {
        const due = plannedDue.trim() || null
        await supabase
          .from('machine_lifecycle_entries')
          .update({ next_due_date: due })
          .eq('id', ticket.lifecycle_entry_id)
      }

      onSuccess(isPlanned ? 'Geplante Reparatur gespeichert.' : 'Störung gespeichert.')
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
        <h3 className="text-lg font-bold">
          {isPlanned ? 'Geplante Reparatur bearbeiten' : 'Störung bearbeiten'}
        </h3>
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

        {isPlanned && (
          <label className="mt-4 block">
            <span className="text-kwd-muted text-sm font-medium">
              Geplantes Datum (optional)
            </span>
            <input
              type="date"
              value={plannedDue}
              onChange={(e) => setPlannedDue(e.target.value)}
              className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
            />
            <p className="text-kwd-muted mt-1 text-xs">
              Leer = keine Anlauffrist, nur das Datum der geplanten Reparatur.
            </p>
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
              if (next === 'open') {
                setAssignedTo('')
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
