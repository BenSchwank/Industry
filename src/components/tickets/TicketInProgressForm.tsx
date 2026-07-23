import { useEffect, useState, type FormEvent } from 'react'
import {
  useActiveAssignees,
  useSetTicketInProgress,
} from '../../hooks/useTicketActions'
import { useAuthStore } from '../../stores/authStore'

interface TicketInProgressFormProps {
  ticketId: string
  ticketLabel?: string
  initialAssigneeId?: string | null
  onClose: () => void
  onSuccess: (message: string) => void
}

/** Dialog: Störung „In Arbeit“ setzen und Zuständigen wählen. */
export function TicketInProgressForm({
  ticketId,
  ticketLabel,
  initialAssigneeId = null,
  onClose,
  onSuccess,
}: TicketInProgressFormProps) {
  const userId = useAuthStore((s) => s.user?.id)
  const { data: assignees = [], isLoading } = useActiveAssignees()
  const setInProgress = useSetTicketInProgress()
  const [assignedTo, setAssignedTo] = useState(initialAssigneeId || userId || '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!assignedTo && (initialAssigneeId || userId)) {
      setAssignedTo(initialAssigneeId || userId || '')
    }
  }, [assignedTo, initialAssigneeId, userId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!assignedTo) {
      setError('Bitte einen Benutzer wählen')
      return
    }
    setError(null)
    try {
      await setInProgress.mutateAsync({ id: ticketId, assigned_to: assignedTo })
      const name = assignees.find((a) => a.id === assignedTo)?.username ?? 'Benutzer'
      onSuccess(`In Arbeit – zuständig: ${name}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text w-full max-w-md rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">In Arbeit setzen</h3>
        {ticketLabel && <p className="text-kwd-muted mt-1 text-sm">{ticketLabel}</p>}
        <p className="text-kwd-muted mt-2 text-sm">
          Wähle, wer an dieser Störung arbeitet – sichtbar für alle.
        </p>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Zuständig *</span>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            required
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4 text-base"
          >
            <option value="">{isLoading ? 'Lade Benutzer…' : 'Benutzer wählen…'}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username}
                {a.id === userId ? ' (ich)' : ''}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-kwd-danger mt-3 text-sm font-medium">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-kwd-surface-light min-h-[52px] flex-1 rounded-xl font-semibold"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={setInProgress.isPending || !assignedTo}
            className="bg-kwd-primary text-kwd-bg min-h-[52px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {setInProgress.isPending ? 'Speichern…' : 'Übernehmen'}
          </button>
        </div>
      </form>
    </div>
  )
}
