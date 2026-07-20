import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TicketForm } from '../components/tickets/TicketForm'
import { useTicketSync, useTicketsRealtime } from '../hooks/useTicketSync'
import { supabase } from '../lib/supabase'
import { useOfflineTicketStore } from '../stores/offlineTicketStore'

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-kwd-muted',
  medium: 'text-kwd-warning',
  high: 'text-kwd-primary',
  critical: 'text-kwd-danger',
}

export default function TicketsPage() {
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const pending = useOfflineTicketStore((s) => s.pending)

  useTicketSync()
  useTicketsRealtime()

      const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, description, status, priority, created_at, created_by, machines(name, barcode)')
        .order('created_at', { ascending: false })
      if (error) {
        // Migration noch nicht: ohne created_by
        if (/created_by/i.test(error.message)) {
          const fb = await supabase
            .from('tickets')
            .select('id, description, status, priority, created_at, machines(name, barcode)')
            .order('created_at', { ascending: false })
          if (fb.error) throw fb.error
          return (fb.data ?? []).map((t) => ({ ...t, created_by: null as string | null }))
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

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Störungen…</p>
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Störungen</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-kwd-primary text-kwd-bg min-h-[48px] rounded-xl px-5 font-bold"
        >
          + Melden
        </button>
      </div>

      {toast && (
        <p className="bg-kwd-success/20 text-kwd-success rounded-lg px-4 py-2 text-sm font-medium">
          {toast}
        </p>
      )}

      {pending.length > 0 && (
        <section className="border-kwd-warning bg-kwd-warning/10 rounded-xl border-2 p-4">
          <p className="text-kwd-warning text-xs font-bold uppercase">
            {pending.length} offline gespeichert
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {pending.map((t) => (
              <li key={t.localId} className="bg-kwd-surface rounded-lg p-3 text-sm">
                <p className="font-semibold">{t.machine_name}</p>
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

      {tickets?.length === 0 && pending.length === 0 && (
        <div className="bg-kwd-surface rounded-xl p-6 text-center">
          <p className="text-kwd-muted">Keine offenen Störungen.</p>
          <p className="text-kwd-muted mt-1 text-sm">
            Offline-Meldungen werden automatisch synchronisiert.
          </p>
        </div>
      )}

      {tickets?.map((ticket) => {
        const machine = ticket.machines as { name: string; barcode: string } | null
        return (
          <article key={ticket.id} className="bg-kwd-surface rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-kwd-primary text-xs font-bold">{machine?.barcode ?? '–'}</p>
                <p className="font-semibold">{machine?.name ?? 'Unbekannte Maschine'}</p>
              </div>
              <span className={`text-xs font-bold uppercase ${PRIORITY_COLORS[ticket.priority]}`}>
                {ticket.priority}
              </span>
            </div>
            <p className="text-kwd-muted mt-2 text-sm">{ticket.description}</p>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="bg-kwd-bg rounded px-2 py-1 font-medium capitalize">
                {ticket.status}
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
          </article>
        )
      })}

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
