import { useState, type FormEvent } from 'react'
import { usePromoteTicketToRepair } from '../../hooks/useTicketActions'

export interface TicketPromoteTarget {
  id: string
  description: string
  machine_id: string
  machine_label?: string
}

interface TicketPromoteRepairFormProps {
  ticket: TicketPromoteTarget
  onClose: () => void
  onSuccess: (message: string) => void
}

/**
 * Störung → geplante Reparatur auf dem Reparaturen-Tab (optional mit Monteur-Termin).
 */
export function TicketPromoteRepairForm({
  ticket,
  onClose,
  onSuccess,
}: TicketPromoteRepairFormProps) {
  const promote = usePromoteTicketToRepair()
  const defaultTitle =
    ticket.description.trim().slice(0, 80) || 'Geplante Reparatur'
  const [title, setTitle] = useState(defaultTitle)
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Titel ist erforderlich')
      return
    }
    setError(null)
    try {
      await promote.mutateAsync({
        ticketId: ticket.id,
        machineId: ticket.machine_id,
        title: title.trim(),
        description: ticket.description,
        next_due_date: dueDate.trim() || null,
      })
      onSuccess(
        dueDate.trim()
          ? 'Als geplante Reparatur übernommen – erscheint unter Reparaturen (mit Termin).'
          : 'Als geplante Reparatur übernommen – erscheint unter Reparaturen.',
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verschieben fehlgeschlagen')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">Nach Reparaturen verschieben</h3>
        <p className="text-kwd-muted mt-1 text-sm">
          Legt eine geplante Reparatur an und verknüpft die Störung. Mit Datum erscheint sie als
          Monteur-Termin; ohne Datum unter „Störungen zu Wartung / Reparatur“.
        </p>
        {ticket.machine_label && (
          <p className="text-kwd-primary mt-2 text-sm font-semibold">{ticket.machine_label}</p>
        )}

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Titel der Reparatur</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">
            Monteur-Termin (optional)
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
          />
          <p className="text-kwd-muted mt-1 text-xs">
            Leer lassen = längere Reparatur ohne festen Termin, trotzdem im Reparaturen-Tab.
          </p>
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
            disabled={promote.isPending}
            className="bg-kwd-primary text-kwd-bg min-h-[48px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {promote.isPending ? 'Speichern…' : 'Verschieben'}
          </button>
        </div>
      </form>
    </div>
  )
}
