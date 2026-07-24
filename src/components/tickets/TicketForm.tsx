import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MachineSearchSelect } from '../machines/MachineSearchSelect'
import {
  LifecycleImagePickButtons,
  PendingPhotoStrip,
} from '../machines/LifecyclePhotos'
import { assertLifecycleImage } from '../../hooks/useLifecyclePhotos'
import { useAddLifecycleEntry } from '../../hooks/useMachineLifecycle'
import {
  TICKET_PHOTOS_SQL_HINT,
  useUploadTicketPhotos,
} from '../../hooks/useTicketPhotos'
import { createTicket } from '../../lib/syncTickets'
import { supabase } from '../../lib/supabase'
import { useAppStore } from '../../stores/appStore'
import type { TicketPriority } from '../../types/database'

interface TicketFormProps {
  onClose: () => void
  onSuccess: (message: string) => void
  /** Vorausgewählte Maschine (z. B. aus Scanner / Detail) */
  initialMachineId?: string | null
  initialMachineName?: string | null
}

type ReportKind = 'issue' | 'planned_repair'
type ReferenceMode = 'machine' | 'free'

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
]

export function TicketForm({
  onClose,
  onSuccess,
  initialMachineId = null,
  initialMachineName = null,
}: TicketFormProps) {
  const isOnline = useAppStore((s) => s.isOnline)
  const selectedMachineId = useAppStore((s) => s.selectedMachineId)
  const queryClient = useQueryClient()
  const uploadPhotos = useUploadTicketPhotos()
  const addEntry = useAddLifecycleEntry()

  const [reportKind, setReportKind] = useState<ReportKind>('issue')
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('machine')
  const [machineId, setMachineId] = useState(initialMachineId ?? selectedMachineId ?? '')
  const [machineName, setMachineName] = useState(initialMachineName ?? '')
  const [referenceLabel, setReferenceLabel] = useState('')
  const [plannedDate, setPlannedDate] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialMachineId) {
      setMachineId(initialMachineId)
      setReferenceMode('machine')
      if (initialMachineName) setMachineName(initialMachineName)
    }
  }, [initialMachineId, initialMachineName])

  const canSubmit =
    description.trim() &&
    (referenceMode === 'machine' ? Boolean(machineId) : Boolean(referenceLabel.trim()))

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

  async function uploadIfNeeded(ticketId: string | undefined) {
    if (!ticketId || pendingPhotos.length === 0) return null
    try {
      await uploadPhotos.mutateAsync({
        ticketId,
        machineId: referenceMode === 'machine' ? machineId || null : null,
        files: pendingPhotos,
      })
      return null
    } catch (photoErr) {
      return photoErr instanceof Error
        ? photoErr.message
        : `Fotos fehlgeschlagen. ${TICKET_PHOTOS_SQL_HINT}`
    }
  }

  /** Geplante Reparatur mit Maschine: Ticket aus offenen Störungen nehmen. */
  async function resolvePlannedMachineTicket(ticketId: string | undefined) {
    if (!ticketId) return
    await supabase
      .from('tickets')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
    void queryClient.invalidateQueries({ queryKey: ['tickets'] })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    const freeLabel = referenceLabel.trim()
    const desc = description.trim()
    const due = plannedDate.trim() || null
    setSubmitting(true)
    setError(null)

    try {
      if (reportKind === 'planned_repair') {
        if (referenceMode === 'machine') {
          const title = desc.slice(0, 80) || 'Geplante Reparatur'
          const entry = await addEntry.mutateAsync({
            machine_id: machineId,
            entry_type: 'repair',
            title,
            description: desc,
            next_due_date: due,
            planned_repair: true,
          })
          const entryId =
            entry && typeof entry === 'object' && 'id' in entry
              ? String((entry as { id: string }).id)
              : null

          const result = await createTicket(
            {
              machine_id: machineId,
              machine_name: machineName || 'Unbekannt',
              reference_label: null,
              description: due
                ? `${desc}\nGeplanter Termin: ${new Date(`${due}T12:00:00`).toLocaleDateString('de-DE')}`
                : desc,
              priority,
              lifecycle_entry_id: entryId,
              kind: 'planned_repair',
            },
            isOnline,
          )

          if (result.mode === 'error') {
            setError(result.message ?? 'Fehler beim Speichern')
            setSubmitting(false)
            return
          }

          if (result.mode === 'queued') {
            setSubmitting(false)
            onSuccess(
              pendingPhotos.length > 0
                ? 'Geplante Reparatur offline gespeichert – Fotos bitte nach dem Sync erneut anhängen.'
                : 'Geplante Reparatur offline gespeichert – wird synchronisiert.',
            )
            onClose()
            return
          }

          const photoErr = await uploadIfNeeded(result.ticketId)
          // Nur mit Termin aus Störungen nehmen; ohne Termin bleibt verknüpft offen unter Reparaturen
          if (due) {
            await resolvePlannedMachineTicket(result.ticketId)
          }
          void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
          void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
          void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
          void queryClient.invalidateQueries({ queryKey: ['tickets'] })
          setSubmitting(false)
          onSuccess(
            photoErr
              ? `Geplante Reparatur angelegt, Fotos fehlgeschlagen: ${photoErr}`
              : due
                ? 'Geplante Reparatur angelegt – Termin in Maschinenliste und unter Reparaturen.'
                : 'Geplante Reparatur angelegt – unter Reparaturen ohne festen Termin.',
          )
          onClose()
          return
        }

        // Eigener Bezugspunkt → nur bei geplanter Reparatur unter Reparaturen
        const bodyParts = [desc]
        if (due) {
          bodyParts.push(
            `Geplanter Termin: ${new Date(`${due}T12:00:00`).toLocaleDateString('de-DE')}`,
          )
        }
        const result = await createTicket(
          {
            machine_id: null,
            machine_name: freeLabel,
            reference_label: freeLabel,
            description: bodyParts.join('\n'),
            priority,
            lifecycle_entry_id: null,
            kind: 'planned_repair',
          },
          isOnline,
        )

        if (result.mode === 'error') {
          setError(result.message ?? 'Fehler beim Speichern')
          setSubmitting(false)
          return
        }

        if (result.mode === 'queued') {
          setSubmitting(false)
          onSuccess('Geplante Reparatur offline gespeichert – wird synchronisiert.')
          onClose()
          return
        }

        const photoErr = await uploadIfNeeded(result.ticketId)
        void queryClient.invalidateQueries({ queryKey: ['maintenance-free-repairs'] })
        void queryClient.invalidateQueries({ queryKey: ['tickets'] })
        setSubmitting(false)
        onSuccess(
          photoErr
            ? `Geplante Reparatur angelegt, Fotos fehlgeschlagen: ${photoErr}`
            : 'Geplante Reparatur mit Bezugspunkt angelegt – erscheint unter Reparaturen.',
        )
        onClose()
        return
      }

      // Einfache Störung
      const result = await createTicket(
        referenceMode === 'machine'
          ? {
              machine_id: machineId,
              machine_name: machineName || 'Unbekannt',
              reference_label: null,
              description: desc,
              priority,
              lifecycle_entry_id: null,
              kind: 'issue',
            }
          : {
              machine_id: null,
              machine_name: freeLabel,
              reference_label: freeLabel,
              description: desc,
              priority,
              lifecycle_entry_id: null,
              kind: 'issue',
            },
        isOnline,
      )

      if (result.mode === 'error') {
        setSubmitting(false)
        setError(result.message ?? 'Fehler beim Speichern')
        return
      }

      if (result.mode === 'queued') {
        setSubmitting(false)
        onSuccess(
          pendingPhotos.length > 0
            ? 'Störung offline gespeichert – Fotos bitte nach dem Sync erneut anhängen (Online).'
            : 'Störung offline gespeichert – wird synchronisiert sobald das Netz da ist.',
        )
        onClose()
        return
      }

      const photoErr = await uploadIfNeeded(result.ticketId)
      setSubmitting(false)
      onSuccess(
        photoErr
          ? `Störung gemeldet, Fotos fehlgeschlagen: ${photoErr}`
          : pendingPhotos.length > 0
            ? 'Störung mit Fotos gemeldet.'
            : 'Störung erfolgreich gemeldet.',
      )
      onClose()
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  const isPlanned = reportKind === 'planned_repair'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">
          {isPlanned ? 'Geplante Reparatur' : 'Störung melden'}
        </h3>
        {!isOnline && (
          <p className="text-kwd-warning mt-2 text-sm font-medium">
            Offline-Modus – Meldung wird lokal gespeichert.
          </p>
        )}

        <fieldset className="mt-4">
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

        {isPlanned && (
          <label className="mt-4 block">
            <span className="text-kwd-muted text-sm font-medium">
              Monteur-Termin (optional)
            </span>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4 text-base"
            />
            <p className="text-kwd-muted mt-1 text-xs">
              Mit Datum: Termin in der Maschinenliste. Ohne Datum: keine Anlauffrist, Reparatur bleibt offen.
            </p>
          </label>
        )}

        <fieldset className="mt-4">
          <legend className="text-kwd-muted text-sm font-medium">Bezug</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setReferenceMode('machine')}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                referenceMode === 'machine'
                  ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                  : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
              }`}
            >
              Maschine
            </button>
            <button
              type="button"
              onClick={() => setReferenceMode('free')}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                referenceMode === 'free'
                  ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                  : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
              }`}
            >
              Eigener Bezugspunkt
            </button>
          </div>
        </fieldset>

        {referenceMode === 'machine' ? (
          <div className="mt-4">
            <MachineSearchSelect
              value={machineId}
              required
              onChange={(id, machine) => {
                setMachineId(id)
                setMachineName(machine?.name ?? '')
              }}
            />
          </div>
        ) : (
          <label className="mt-4 block">
            <span className="text-kwd-muted text-sm font-medium">Bezugspunkt *</span>
            <input
              type="text"
              value={referenceLabel}
              onChange={(e) => setReferenceLabel(e.target.value)}
              required
              placeholder="z.B. Halle 3, Förderband, Heizung, Dach…"
              className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4 text-base"
            />
            <p className="text-kwd-muted mt-1 text-xs">
              Freie Bezeichnung – ohne Maschine in der Liste
            </p>
          </label>
        )}

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
            placeholder={isPlanned ? 'Was ist geplant?' : 'Was ist passiert?'}
            className="bg-kwd-bg border-kwd-surface-light mt-1 w-full rounded-xl border px-4 py-3 text-base"
          />
        </label>

        <div className="mt-4">
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
            disabled={submitting || !canSubmit}
            className="bg-kwd-primary text-kwd-bg min-h-[52px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {submitting ? 'Speichern…' : isPlanned ? 'Anlegen' : 'Melden'}
          </button>
        </div>
      </form>
    </div>
  )
}
