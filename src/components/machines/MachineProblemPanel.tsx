import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTicketOptimistic } from '../../lib/syncTickets'
import { useAppStore } from '../../stores/appStore'
import type { TicketPriority } from '../../types/database'

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
]

interface MachineProblemPanelProps {
  machineId: string
  machineName: string
  onLogged?: () => void
}

export function MachineProblemPanel({ machineId, machineName, onLogged }: MachineProblemPanelProps) {
  const isOnline = useAppStore((s) => s.isOnline)
  const queryClient = useQueryClient()
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) return

    setSubmitting(true)
    setError(null)
    setMessage(null)

    const result = await createTicketOptimistic(
      {
        machine_id: machineId,
        machine_name: machineName,
        description: description.trim(),
        priority,
      },
      isOnline,
      queryClient,
    )

    setSubmitting(false)

    if (result.mode === 'error') {
      setError(result.message ?? 'Fehler beim Speichern')
      return
    }

    setDescription('')
    setMessage(
      result.mode === 'queued'
        ? 'Problem offline gespeichert – wird synchronisiert.'
        : 'Problem erfasst – erscheint sofort in der Historie.',
    )
    onLogged?.()
  }

  return (
    <article className="bg-kwd-surface border-kwd-danger/30 rounded-xl border-2 p-4">
      <header className="mb-3">
        <h3 className="font-bold">Problem melden</h3>
        <p className="text-kwd-muted text-sm">Störung für {machineName} erfassen</p>
      </header>

      {!isOnline && (
        <p className="text-kwd-warning bg-kwd-warning/10 mb-3 rounded-lg px-3 py-2 text-sm font-medium">
          Offline – wird lokal gespeichert und später synchronisiert.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="block">
          <span className="text-kwd-muted text-sm font-medium">Priorität</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4 text-base"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-kwd-muted text-sm font-medium">Problembeschreibung *</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            placeholder="Was ist passiert? Symptome, Geräusche, Fehlermeldungen…"
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[120px] w-full rounded-xl border px-4 py-3 text-base"
          />
        </label>

        {error && <p className="text-kwd-danger text-sm font-medium">{error}</p>}
        {message && <p className="text-kwd-success text-sm font-medium">{message}</p>}

        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="bg-kwd-danger text-kwd-bg min-h-[52px] rounded-xl text-base font-bold disabled:opacity-50"
        >
          {submitting ? 'Speichern…' : 'Problem erfassen'}
        </button>
      </form>
    </article>
  )
}
