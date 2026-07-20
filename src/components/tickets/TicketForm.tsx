import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { createTicket } from '../../lib/syncTickets'
import { useAppStore } from '../../stores/appStore'
import type { TicketPriority } from '../../types/database'

interface TicketFormProps {
  onClose: () => void
  onSuccess: (message: string) => void
}

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
]

export function TicketForm({ onClose, onSuccess }: TicketFormProps) {
  const isOnline = useAppStore((s) => s.isOnline)
  const [machineId, setMachineId] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: machines } = useQuery({
    queryKey: ['machines-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machines')
        .select('id, name, barcode')
        .order('name')
      if (error) throw error
      return data
    },
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!machineId || !description.trim()) return

    const machine = machines?.find((m) => m.id === machineId)
    setSubmitting(true)
    setError(null)

    const result = await createTicket(
      {
        machine_id: machineId,
        machine_name: machine?.name ?? 'Unbekannt',
        description: description.trim(),
        priority,
      },
      isOnline,
    )

    setSubmitting(false)

    if (result.mode === 'error') {
      setError(result.message ?? 'Fehler beim Speichern')
      return
    }

    onSuccess(
      result.mode === 'queued'
        ? 'Störung offline gespeichert – wird synchronisiert sobald das Netz da ist.'
        : 'Störung erfolgreich gemeldet.',
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text w-full max-w-lg rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">Störung melden</h3>
        {!isOnline && (
          <p className="text-kwd-warning mt-2 text-sm font-medium">
            Offline-Modus – Meldung wird lokal gespeichert.
          </p>
        )}

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Maschine</span>
          <select
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
            required
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4"
          >
            <option value="">Maschine wählen…</option>
            {machines?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.barcode} – {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Priorität</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
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
            rows={4}
            placeholder="Was ist passiert?"
            className="bg-kwd-bg border-kwd-surface-light mt-1 w-full rounded-xl border px-4 py-3 text-base"
          />
        </label>

        {error && (
          <p className="text-kwd-danger mt-3 text-sm font-medium">{error}</p>
        )}

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
            disabled={submitting}
            className="bg-kwd-primary text-kwd-bg min-h-[52px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {submitting ? 'Speichern…' : 'Melden'}
          </button>
        </div>
      </form>
    </div>
  )
}
