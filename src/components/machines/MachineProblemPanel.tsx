import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeleteTicket, useResolveTicket } from '../../hooks/useTicketActions'
import { TicketEditForm, type TicketEditTarget } from '../tickets/TicketEditForm'
import { createTicketOptimistic } from '../../lib/syncTickets'
import { supabase } from '../../lib/supabase'
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
  const resolveTicket = useResolveTicket()
  const deleteTicket = useDeleteTicket()
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editTicket, setEditTicket] = useState<TicketEditTarget | null>(null)

  const { data: openTickets = [] } = useQuery({
    queryKey: ['machine-open-tickets', machineId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from('tickets')
        .select('id, description, status, priority, created_at')
        .eq('machine_id', machineId)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
      if (qErr) throw qErr
      return data ?? []
    },
  })

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
    void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
    onLogged?.()
  }

  async function handleResolve(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await resolveTicket.mutateAsync(id)
      setMessage('Störung als erledigt markiert.')
      void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erledigen fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Störung wirklich löschen?')) return
    setBusyId(id)
    setError(null)
    try {
      await deleteTicket.mutateAsync(id)
      setMessage('Störung gelöscht.')
      void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
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

      {openTickets.length > 0 && (
        <section className="bg-kwd-surface border-kwd-border rounded-xl border p-4">
          <h3 className="mb-3 font-bold">
            Offene Störungen ({openTickets.length})
          </h3>
          <ul className="flex flex-col gap-3">
            {openTickets.map((t) => {
              const busy = busyId === t.id
              return (
                <li key={t.id} className="border-kwd-border rounded-lg border p-3">
                  <p className="text-sm">{t.description}</p>
                  <p className="text-kwd-muted mt-1 text-xs">
                    {new Date(t.created_at).toLocaleString('de-DE')} · {t.priority}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setEditTicket({
                          id: t.id,
                          description: t.description,
                          priority: t.priority,
                          status: t.status,
                          machine_id: machineId,
                          machine_label: machineName,
                        })
                      }
                      className="kwd-btn min-h-[40px] px-3 text-sm font-semibold"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleResolve(t.id)}
                      className="bg-kwd-success min-h-[40px] rounded-lg px-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busy ? '…' : 'Erledigt'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(t.id)}
                      className="border-kwd-danger text-kwd-danger min-h-[40px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      Löschen
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {editTicket && (
        <TicketEditForm
          ticket={editTicket}
          onClose={() => setEditTicket(null)}
          onSuccess={(msg) => {
            setMessage(msg)
            void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
          }}
        />
      )}
    </div>
  )
}
