import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TicketForm } from '../components/tickets/TicketForm'
import { TicketEditForm, type TicketEditTarget } from '../components/tickets/TicketEditForm'
import { TicketCard } from '../components/tickets/TicketCard'
import { useTicketSync, useTicketsRealtime } from '../hooks/useTicketSync'
import {
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITIES,
  useDeleteTicket,
  useResolveTicket,
} from '../hooks/useTicketActions'
import {
  filterTickets,
  groupTicketsByPriority,
  isoDateDaysAgo,
  PRIORITY_SECTION_CLS,
  todayIsoDate,
  type TicketListItem,
  type TicketPriorityFilter,
  type TicketStatusFilter,
} from '../lib/ticketFilters'
import { supabase } from '../lib/supabase'
import { useOfflineTicketStore } from '../stores/offlineTicketStore'
import type { TicketPriority } from '../types/database'

const STATUS_FILTERS: { value: TicketStatusFilter; label: string }[] = [
  { value: 'open', label: 'Offen' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'resolved', label: 'Erledigt' },
  { value: 'closed', label: 'Geschlossen' },
  { value: 'all', label: 'Alle Status' },
]

const DATE_PRESETS = [
  { id: 'today', label: 'Heute', from: () => todayIsoDate(), to: () => todayIsoDate() },
  { id: '7d', label: '7 Tage', from: () => isoDateDaysAgo(7), to: () => todayIsoDate() },
  { id: '30d', label: '30 Tage', from: () => isoDateDaysAgo(30), to: () => todayIsoDate() },
  { id: 'all', label: 'Alle Daten', from: () => '', to: () => '' },
] as const

const filterInputCls =
  'border-kwd-border bg-kwd-paper min-h-[40px] w-full border px-3 text-sm'

export default function TicketsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editTicket, setEditTicket] = useState<TicketEditTarget | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('open')
  const [priorityFilter, setPriorityFilter] = useState<TicketPriorityFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [datePreset, setDatePreset] = useState<string>('all')
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
          })) as TicketListItem[]
        }
        throw error
      }
      return data as TicketListItem[]
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

  const filtered = useMemo(
    () =>
      filterTickets(tickets ?? [], {
        searchQuery,
        statusFilter,
        priorityFilter,
        dateFrom,
        dateTo,
      }),
    [tickets, searchQuery, statusFilter, priorityFilter, dateFrom, dateTo],
  )

  const grouped = useMemo(
    () => (priorityFilter === 'all' ? groupTicketsByPriority(filtered) : null),
    [filtered, priorityFilter],
  )

  const hasActiveFilters =
    searchQuery.trim() ||
    statusFilter !== 'open' ||
    priorityFilter !== 'all' ||
    dateFrom ||
    dateTo

  function applyDatePreset(id: string) {
    setDatePreset(id)
    const preset = DATE_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setDateFrom(preset.from())
    setDateTo(preset.to())
  }

  function resetFilters() {
    setSearchQuery('')
    setStatusFilter('open')
    setPriorityFilter('all')
    setDateFrom('')
    setDateTo('')
    setDatePreset('all')
  }

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

  function renderTicketList(list: TicketListItem[]) {
    return list.map((ticket) => (
      <TicketCard
        key={ticket.id}
        ticket={ticket}
        busy={busyId === ticket.id}
        authorName={ticket.created_by ? nameMap?.get(ticket.created_by) : null}
        onEdit={setEditTicket}
        onResolve={(id) => void handleResolve(id)}
        onDelete={(id) => void handleDelete(id)}
      />
    ))
  }

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Störungen…</p>
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Störungen</h2>
          <p className="text-kwd-muted text-sm">
            {filtered.length} von {tickets?.length ?? 0} angezeigt
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-kwd-primary text-kwd-bg min-h-[48px] rounded-xl px-5 font-bold"
        >
          + Melden
        </button>
      </div>

      <section className="bg-kwd-surface border-kwd-border flex flex-col gap-3 rounded-xl border p-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchen: Maschine, Bezug, Text, Status…"
          className={filterInputCls}
          aria-label="Störungen durchsuchen"
        />

        <div className="flex flex-wrap gap-2">
          <span className="text-kwd-muted w-full text-[11px] font-semibold tracking-wide uppercase">
            Status
          </span>
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                statusFilter === value
                  ? 'bg-kwd-primary text-white'
                  : 'bg-kwd-bg text-kwd-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-kwd-muted w-full text-[11px] font-semibold tracking-wide uppercase">
            Priorität
          </span>
          <button
            type="button"
            onClick={() => setPriorityFilter('all')}
            className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
              priorityFilter === 'all' ? 'bg-kwd-primary text-white' : 'bg-kwd-bg text-kwd-muted'
            }`}
          >
            Alle
          </button>
          {TICKET_PRIORITIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPriorityFilter(value)}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                priorityFilter === value
                  ? 'bg-kwd-primary text-white'
                  : 'bg-kwd-bg text-kwd-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-kwd-muted w-full text-[11px] font-semibold tracking-wide uppercase">
            Zeitraum
          </span>
          {DATE_PRESETS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => applyDatePreset(id)}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                datePreset === id ? 'bg-kwd-primary text-white' : 'bg-kwd-bg text-kwd-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-kwd-muted text-xs font-medium">Von</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setDatePreset('custom')
              }}
              className={`${filterInputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-kwd-muted text-xs font-medium">Bis</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setDatePreset('custom')
              }}
              className={`${filterInputCls} mt-1`}
            />
          </label>
        </div>

        {hasActiveFilters && (
          <button type="button" onClick={resetFilters} className="kwd-btn self-start text-xs">
            Filter zurücksetzen
          </button>
        )}
      </section>

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
        </section>
      )}

      {filtered.length === 0 && pending.length === 0 && (
        <div className="bg-kwd-surface rounded-xl p-6 text-center">
          <p className="text-kwd-muted">
            {hasActiveFilters ? 'Keine Treffer für die Filter.' : 'Keine Störungen.'}
          </p>
        </div>
      )}

      {grouped
        ? grouped.map(({ priority, tickets: groupTickets }) => (
            <section
              key={priority}
              className={`flex flex-col gap-3 rounded-xl border-2 p-3 ${PRIORITY_SECTION_CLS[priority as TicketPriority]}`}
            >
              <header className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold tracking-wide uppercase">
                  {TICKET_PRIORITY_LABEL[priority] ?? priority}
                </h3>
                <span className="text-kwd-muted text-xs font-semibold">
                  {groupTickets.length}
                </span>
              </header>
              {renderTicketList(groupTickets)}
            </section>
          ))
        : renderTicketList(filtered)}

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
