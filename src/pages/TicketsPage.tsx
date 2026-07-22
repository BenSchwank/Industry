import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TicketForm } from '../components/tickets/TicketForm'
import { TicketEditForm, type TicketEditTarget } from '../components/tickets/TicketEditForm'
import { useTicketSync, useTicketsRealtime } from '../hooks/useTicketSync'
import {
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  useDeleteTicket,
  useResolveTicket,
} from '../hooks/useTicketActions'
import { supabase } from '../lib/supabase'
import { useOfflineTicketStore } from '../stores/offlineTicketStore'

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-kwd-muted',
  medium: 'text-kwd-warning',
  high: 'text-kwd-primary',
  critical: 'text-kwd-danger',
}

type FilterMode = 'open' | 'all'

export default function TicketsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editTicket, setEditTicket] = useState<TicketEditTarget | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('open')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const pending = useOfflineTicketStore((s) => s.pending)

  const resolveTicket = useResolveTicket()
  const deleteTicket = useDeleteTicket()

  useTicketSync()
  useTicketsRealtime()

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(
          'id, description, status, priority, created_at, created_by, reference_label, machine_id, machines(name, barcode)',
        )
        .order('created_at', { ascending: false })
      if (error) {
        if (/created_by|reference_label/i.test(error.message)) {
          const fb = await supabase
            .from('tickets')
            .select('id, description, status, priority, created_at, machine_id, machines(name, barcode)')
            .order('created_at', { ascending: false })
          if (fb.error) throw fb.error
          return (fb.data ?? []).map((t) => ({
            ...t,
            created_by: null as string | null,
            reference_label: null as string | null,
          }))
        }
        throw error
      }
      return data
    },
  })

  const { data: nameMap } = useQuery({
    queryKey: ['ticket-authors', tickets?.map((t) => t.created_by).join(',')],
    enabled: Boolean(tickets?.some((t) => t.created_by)),
    queryFn: async () => {
      const { resolveUsernames } = await import('../lib/resolveUsernames')
      return resolveUsernames(tickets?.map((t) => t.created_by) ?? [])
    },
  })

  const visible =
    tickets?.filter((t) =>
      filter === 'open' ? t.status === 'open' || t.status === 'in_progress' : true,
    ) ?? []

  async function handleResolve(id: string) {
    setBusyId(id)
    setActionError(null)
    try {
      await resolveTicket.mutateAsync(id)
      setToast('Störung als erledigt markiert.')
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erledigen fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Störung wirklich löschen? Das kann nicht rückgängig gemacht werden.')) {
      return
    }
    setBusyId(id)
    setActionError(null)
    try {
      await deleteTicket.mutateAsync(id)
      setToast('Störung gelöscht.')
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Störungen…</p>
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Störungen</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-kwd-primary text-kwd-bg min-h-[48px] rounded-xl px-5 font-bold"
        >
          + Melden
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFilter('open')}
          className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold ${
            filter === 'open' ? 'bg-kwd-primary text-white' : 'bg-kwd-surface text-kwd-muted'
          }`}
        >
          Offen
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold ${
            filter === 'all' ? 'bg-kwd-primary text-white' : 'bg-kwd-surface text-kwd-muted'
          }`}
        >
          Alle
        </button>
      </div>

      {toast && (
        <p className="bg-kwd-success/20 text-kwd-success rounded-lg px-4 py-2 text-sm font-medium">
          {toast}
        </p>
      )}
      {actionError && (
        <p className="bg-kwd-danger/10 text-kwd-danger rounded-lg px-4 py-2 text-sm">{actionError}</p>
      )}

      {pending.length > 0 && (
        <section className="border-kwd-warning bg-kwd-warning/10 rounded-xl border-2 p-4">
          <p className="text-kwd-warning text-xs font-bold uppercase">
            {pending.length} offline gespeichert
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {pending.map((t) => (
              <li key={t.localId} className="bg-kwd-surface rounded-lg p-3 text-sm">
                <p className="font-semibold">
                  {t.machine_id ? t.machine_name : `Bezug: ${t.machine_name}`}
                </p>
                <p className="text-kwd-muted">{t.description}</p>
                {t.syncError && (
                  <p className="text-kwd-danger mt-1 text-xs">Sync-Fehler: {t.syncError}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="text-kwd-muted mt-2 text-xs">
            Werden automatisch synchronisiert, sobald du online bist.
          </p>
        </section>
      )}

      {visible.length === 0 && pending.length === 0 && (
        <div className="bg-kwd-surface rounded-xl p-6 text-center">
          <p className="text-kwd-muted">
            {filter === 'open' ? 'Keine offenen Störungen.' : 'Keine Störungen.'}
          </p>
        </div>
      )}

      {visible.map((ticket) => {
        const machine = ticket.machines as { name: string; barcode: string } | null
        const referenceLabel = (ticket as { reference_label?: string | null }).reference_label
        const isFreeReference = !machine && Boolean(referenceLabel?.trim())
        const isOpen = ticket.status === 'open' || ticket.status === 'in_progress'
        const busy = busyId === ticket.id
        return (
          <article key={ticket.id} className="bg-kwd-surface rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-kwd-primary text-xs font-bold">
                  {isFreeReference ? 'Freier Bezug' : (machine?.barcode ?? '–')}
                </p>
                <p className="font-semibold">
                  {machine?.name ?? referenceLabel?.trim() ?? 'Unbekannte Maschine'}
                </p>
              </div>
              <span className={`text-xs font-bold uppercase ${PRIORITY_COLORS[ticket.priority]}`}>
                {TICKET_PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
              </span>
            </div>
            <p className="text-kwd-muted mt-2 text-sm">{ticket.description}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="bg-kwd-bg rounded px-2 py-1 font-medium">
                {TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
              </span>
              <span className="text-kwd-muted">
                {ticket.created_by && nameMap?.get(ticket.created_by) && (
                  <span className="text-kwd-primary mr-2 font-semibold">
                    {nameMap.get(ticket.created_by)}
                  </span>
                )}
                {new Date(ticket.created_at).toLocaleDateString('de-DE')}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setEditTicket({
                    id: ticket.id,
                    description: ticket.description,
                    priority: ticket.priority,
                    status: ticket.status,
                    machine_id: (ticket as { machine_id?: string | null }).machine_id ?? null,
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
                  onClick={() => void handleResolve(ticket.id)}
                  className="bg-kwd-success min-h-[44px] rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? '…' : 'Erledigt'}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete(ticket.id)}
                className="border-kwd-danger text-kwd-danger min-h-[44px] rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
              >
                Löschen
              </button>
            </div>
          </article>
        )
      })}

      {editTicket && (
        <TicketEditForm
          ticket={editTicket}
          onClose={() => setEditTicket(null)}
          onSuccess={(msg) => {
            setToast(msg)
            setTimeout(() => setToast(null), 4000)
          }}
        />
      )}

      {showForm && (
        <TicketForm
          onClose={() => setShowForm(false)}
          onSuccess={(msg) => {
            setToast(msg)
            setTimeout(() => setToast(null), 4000)
          }}
        />
      )}
    </div>
  )
}
