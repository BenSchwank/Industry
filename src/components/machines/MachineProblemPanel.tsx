import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  TICKET_STATUS_LABEL,
  useClearTicketInProgress,
  useDeleteTicket,
  useResolveTicket,
} from '../../hooks/useTicketActions'
import { assertLifecycleImage } from '../../hooks/useLifecyclePhotos'
import { useAddLifecycleEntry } from '../../hooks/useMachineLifecycle'
import {
  TICKET_PHOTOS_SQL_HINT,
  useTicketPhotosForMachine,
  useUploadTicketPhotos,
} from '../../hooks/useTicketPhotos'
import { TicketEditForm, type TicketEditTarget } from '../tickets/TicketEditForm'
import {
  TicketPromoteRepairForm,
  type TicketPromoteTarget,
} from '../tickets/TicketPromoteRepairForm'
import { TicketInProgressForm } from '../tickets/TicketInProgressForm'
import { createTicketOptimistic } from '../../lib/syncTickets'
import { resolveUsernames } from '../../lib/resolveUsernames'
import { supabase } from '../../lib/supabase'
import { useAppStore } from '../../stores/appStore'
import type { TicketPriority, TicketStatus } from '../../types/database'
import {
  LifecycleImagePickButtons,
  PendingPhotoStrip,
  TicketPhotoPicker,
  TicketPhotoStrip,
} from './LifecyclePhotos'

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
]

type ReportKind = 'issue' | 'planned_repair'

interface MachineOpenTicket {
  id: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  created_at: string
  assigned_to: string | null
}

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
  const clearInProgress = useClearTicketInProgress()
  const uploadPhotos = useUploadTicketPhotos()
  const addEntry = useAddLifecycleEntry()
  const { data: allTicketPhotos = [] } = useTicketPhotosForMachine(machineId)
  const [reportKind, setReportKind] = useState<ReportKind>('issue')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [plannedDate, setPlannedDate] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editTicket, setEditTicket] = useState<TicketEditTarget | null>(null)
  const [promoteTicket, setPromoteTicket] = useState<TicketPromoteTarget | null>(null)
  const [inProgressTicket, setInProgressTicket] = useState<MachineOpenTicket | null>(null)

  const photosByTicket = useMemo(() => {
    const map = new Map<string, typeof allTicketPhotos>()
    for (const p of allTicketPhotos) {
      const list = map.get(p.ticket_id) ?? []
      list.push(p)
      map.set(p.ticket_id, list)
    }
    return map
  }, [allTicketPhotos])

  const { data: openTickets = [] } = useQuery({
    queryKey: ['machine-open-tickets', machineId],
    queryFn: async () => {
      const full = await supabase
        .from('tickets')
        .select('id, description, status, priority, created_at, assigned_to, lifecycle_entry_id')
        .eq('machine_id', machineId)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
      if (!full.error) {
        return ((full.data ?? []) as (MachineOpenTicket & { lifecycle_entry_id?: string | null })[])
          .filter((t) => !t.lifecycle_entry_id)
          .map(({ lifecycle_entry_id: _l, ...t }) => t)
      }

      if (/assigned_to|lifecycle_entry_id|schema cache/i.test(full.error.message)) {
        const fb = await supabase
          .from('tickets')
          .select('id, description, status, priority, created_at')
          .eq('machine_id', machineId)
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false })
        if (fb.error) throw fb.error
        return (fb.data ?? []).map((t) => ({
          ...t,
          assigned_to: null as string | null,
        })) as MachineOpenTicket[]
      }
      throw full.error
    },
  })

  const { data: assigneeNames } = useQuery({
    queryKey: ['machine-ticket-assignees', machineId, openTickets.map((t) => t.assigned_to).join(',')],
    enabled: openTickets.some((t) => t.assigned_to),
    queryFn: () => resolveUsernames(openTickets.map((t) => t.assigned_to)),
  })

  function addPendingFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    try {
      const next = [...list]
      for (const f of next) assertLifecycleImage(f)
      setPendingPhotos((prev) => [...prev, ...next].slice(0, 8))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ungültiges Bild')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) return

    setSubmitting(true)
    setError(null)
    setMessage(null)

    const desc = description.trim()
    const due = plannedDate.trim() || null
    const isPlanned = reportKind === 'planned_repair'

    try {
      let lifecycleEntryId: string | null = null

      if (isPlanned) {
        const title = desc.slice(0, 80) || 'Geplante Reparatur'
        const entry = await addEntry.mutateAsync({
          machine_id: machineId,
          entry_type: 'repair',
          title,
          description: desc,
          next_due_date: due,
          planned_repair: true,
        })
        lifecycleEntryId =
          entry && typeof entry === 'object' && 'id' in entry
            ? String((entry as { id: string }).id)
            : null
      }

      const result = await createTicketOptimistic(
        {
          machine_id: machineId,
          machine_name: machineName,
          description:
            isPlanned && due
              ? `${desc}\nGeplanter Termin: ${new Date(`${due}T12:00:00`).toLocaleDateString('de-DE')}`
              : desc,
          priority,
          lifecycle_entry_id: lifecycleEntryId,
          kind: isPlanned ? 'planned_repair' : 'issue',
        },
        isOnline,
        queryClient,
      )

      if (result.mode === 'error') {
        setSubmitting(false)
        setError(result.message ?? 'Fehler beim Speichern')
        return
      }

      if (result.mode === 'synced' && result.ticketId && isPlanned) {
        if (pendingPhotos.length > 0) {
          try {
            await uploadPhotos.mutateAsync({
              ticketId: result.ticketId,
              machineId,
              files: pendingPhotos,
            })
          } catch (photoErr) {
            if (due) {
              await supabase
                .from('tickets')
                .update({
                  status: 'resolved',
                  resolved_at: new Date().toISOString(),
                })
                .eq('id', result.ticketId)
            }
            setSubmitting(false)
            setDescription('')
            setPlannedDate('')
            setPendingPhotos([])
            setError(
              photoErr instanceof Error
                ? `Reparatur angelegt, Fotos fehlgeschlagen: ${photoErr.message}`
                : `Reparatur angelegt, Fotos fehlgeschlagen. ${TICKET_PHOTOS_SQL_HINT}`,
            )
            void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
            void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
            void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
            void queryClient.invalidateQueries({ queryKey: ['tickets'] })
            onLogged?.()
            return
          }
        }
        // Mit Termin: aus offenen Störungen; ohne Termin offen unter Reparaturen (kein Fälligkeitsdatum)
        if (due) {
          await supabase
            .from('tickets')
            .update({
              status: 'resolved',
              resolved_at: new Date().toISOString(),
            })
            .eq('id', result.ticketId)
        }
        setSubmitting(false)
        setDescription('')
        setPlannedDate('')
        setPendingPhotos([])
        setMessage(
          due
            ? 'Geplante Reparatur angelegt – Termin in Liste und unter Reparaturen (nicht unter Störungen).'
            : 'Geplante Reparatur angelegt – unter Reparaturen ohne festen Termin (nicht unter Störungen).',
        )
        void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
        void queryClient.invalidateQueries({ queryKey: ['ticket-photos', machineId] })
        void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
        void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
        void queryClient.invalidateQueries({ queryKey: ['tickets'] })
        onLogged?.()
        return
      }

      if (result.mode === 'synced' && result.ticketId && pendingPhotos.length > 0) {
        const photosToUpload = pendingPhotos
        try {
          await uploadPhotos.mutateAsync({
            ticketId: result.ticketId,
            machineId,
            files: photosToUpload,
          })
        } catch (photoErr) {
          setSubmitting(false)
          setDescription('')
          setPlannedDate('')
          setPendingPhotos([])
          setError(
            photoErr instanceof Error
              ? `Gespeichert, Fotos fehlgeschlagen: ${photoErr.message}`
              : `Gespeichert, Fotos fehlgeschlagen. ${TICKET_PHOTOS_SQL_HINT}`,
          )
          void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
          void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
          onLogged?.()
          return
        }
        setSubmitting(false)
        setDescription('')
        setPlannedDate('')
        setPendingPhotos([])
        setMessage('Problem mit Fotos erfasst.')
        void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
        void queryClient.invalidateQueries({ queryKey: ['ticket-photos', machineId] })
        void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
        void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
        onLogged?.()
        return
      }

      if (result.mode === 'queued' && pendingPhotos.length > 0) {
        setSubmitting(false)
        setDescription('')
        setPlannedDate('')
        setPendingPhotos([])
        setMessage(
          'Offline gespeichert – Fotos bitte nach dem Sync erneut anhängen (Online).',
        )
        onLogged?.()
        return
      }

      setSubmitting(false)
      setDescription('')
      setPlannedDate('')
      setPendingPhotos([])
      setMessage(
        result.message
          ? result.message
          : result.mode === 'queued'
            ? 'Offline gespeichert – wird synchronisiert.'
            : isPlanned
              ? due
                ? 'Geplante Reparatur angelegt – Termin in Maschinenliste und unter Reparaturen.'
                : 'Geplante Reparatur angelegt – erscheint unter Reparaturen.'
              : 'Problem erfasst – erscheint sofort in der Historie.',
      )
      void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
      void queryClient.invalidateQueries({ queryKey: ['ticket-photos', machineId] })
      void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
      void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
      onLogged?.()
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  async function handleClearInProgress(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await clearInProgress.mutateAsync(id)
      setMessage('Zuständigkeit freigegeben – wieder offen.')
      void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Freigeben fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
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
      void queryClient.invalidateQueries({ queryKey: ['ticket-photos', machineId] })
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
          <p className="text-kwd-muted text-sm">Störung oder geplante Reparatur für {machineName}</p>
        </header>

        {!isOnline && (
          <p className="text-kwd-warning bg-kwd-warning/10 mb-3 rounded-lg px-3 py-2 text-sm font-medium">
            Offline – wird lokal gespeichert und später synchronisiert.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <fieldset>
            <legend className="text-kwd-muted text-sm font-medium">Art</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReportKind('issue')}
                className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                  reportKind === 'issue'
                    ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                    : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
                }`}
              >
                Einfache Störung
              </button>
              <button
                type="button"
                onClick={() => setReportKind('planned_repair')}
                className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                  reportKind === 'planned_repair'
                    ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                    : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
                }`}
              >
                Geplante Reparatur
              </button>
            </div>
          </fieldset>

          {reportKind === 'planned_repair' && (
            <label className="block">
              <span className="text-kwd-muted text-sm font-medium">
                Monteur-Termin (optional)
              </span>
              <input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4 text-base"
              />
            </label>
          )}

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
            <span className="text-kwd-muted text-sm font-medium">
              {reportKind === 'planned_repair' ? 'Beschreibung *' : 'Problembeschreibung *'}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              placeholder={
                reportKind === 'planned_repair'
                  ? 'Was ist geplant?'
                  : 'Was ist passiert? Symptome, Geräusche, Fehlermeldungen…'
              }
              className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[120px] w-full rounded-xl border px-4 py-3 text-base"
            />
          </label>

          <div>
            <span className="text-kwd-muted text-sm font-medium">Fotos (optional)</span>
            <div className="mt-1">
              <LifecycleImagePickButtons
                onFiles={addPendingFiles}
                cameraLabel="Foto aufnehmen"
                galleryLabel="Galerie / Datei"
              />
              <p className="text-kwd-muted mt-1 text-xs">Handy: Galerie oder Dateien · bis 8 Fotos</p>
            </div>
            <PendingPhotoStrip
              files={pendingPhotos}
              onRemove={(i) => setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </div>

          {error && <p className="text-kwd-danger text-sm font-medium">{error}</p>}
          {message && <p className="text-kwd-success text-sm font-medium">{message}</p>}

          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="bg-kwd-danger text-kwd-bg min-h-[52px] rounded-xl text-base font-bold disabled:opacity-50"
          >
            {submitting
              ? 'Speichern…'
              : reportKind === 'planned_repair'
                ? 'Geplante Reparatur anlegen'
                : 'Problem erfassen'}
          </button>
        </form>
      </article>

      {openTickets.length > 0 && (
        <section className="bg-kwd-surface border-kwd-border rounded-xl border p-4">
          <h3 className="mb-3 font-bold">Offene Störungen ({openTickets.length})</h3>
          <ul className="flex flex-col gap-3">
            {openTickets.map((t) => {
              const busy = busyId === t.id
              const photos = photosByTicket.get(t.id) ?? []
              const assignee = t.assigned_to ? assigneeNames?.get(t.assigned_to) : null
              const inProgress = t.status === 'in_progress'
              return (
                <li key={t.id} className="border-kwd-border rounded-lg border p-3">
                  <p className="text-sm whitespace-pre-wrap">{t.description}</p>
                  <p className="text-kwd-muted mt-1 text-xs">
                    {new Date(t.created_at).toLocaleString('de-DE')} · {t.priority}
                    {' · '}
                    <span className={inProgress ? 'text-kwd-primary font-semibold' : ''}>
                      {TICKET_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {assignee && (
                      <span className="text-kwd-primary font-semibold"> · {assignee}</span>
                    )}
                  </p>
                  <TicketPhotoStrip photos={photos} canDelete />
                  <TicketPhotoPicker
                    ticketId={t.id}
                    machineId={machineId}
                    onUploaded={() => {
                      void queryClient.invalidateQueries({ queryKey: ['ticket-photos', machineId] })
                    }}
                  />
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
                          assigned_to: t.assigned_to,
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
                      onClick={() =>
                        setPromoteTicket({
                          id: t.id,
                          description: t.description,
                          machine_id: machineId,
                          machine_label: machineName,
                        })
                      }
                      className="border-kwd-primary text-kwd-primary min-h-[40px] rounded-lg border px-3 text-sm font-bold disabled:opacity-50"
                    >
                      Nach Reparaturen
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setInProgressTicket(t)}
                      className="border-kwd-primary text-kwd-primary min-h-[40px] rounded-lg border px-3 text-sm font-bold disabled:opacity-50"
                    >
                      {inProgress ? 'Zuständig' : 'In Arbeit'}
                    </button>
                    {inProgress && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleClearInProgress(t.id)}
                        className="bg-kwd-bg border-kwd-border text-kwd-muted min-h-[40px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
                      >
                        Freigeben
                      </button>
                    )}
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

      {promoteTicket && (
        <TicketPromoteRepairForm
          ticket={promoteTicket}
          onClose={() => setPromoteTicket(null)}
          onSuccess={(msg) => {
            setMessage(msg)
            void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
            void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
            void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
          }}
        />
      )}

      {inProgressTicket && (
        <TicketInProgressForm
          ticketId={inProgressTicket.id}
          ticketLabel={machineName}
          initialAssigneeId={inProgressTicket.assigned_to}
          canClear={inProgressTicket.status === 'in_progress'}
          onClose={() => setInProgressTicket(null)}
          onSuccess={(msg) => {
            setMessage(msg)
            void queryClient.invalidateQueries({ queryKey: ['machine-open-tickets', machineId] })
          }}
        />
      )}
    </div>
  )
}
