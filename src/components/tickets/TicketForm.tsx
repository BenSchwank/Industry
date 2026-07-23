import { useEffect, useState, type FormEvent } from 'react'
import { LifecycleRepairSelect } from '../machines/LifecycleRepairSelect'
import { MachineSearchSelect } from '../machines/MachineSearchSelect'
import { createTicket } from '../../lib/syncTickets'
import { useAppStore } from '../../stores/appStore'
import type { TicketPriority } from '../../types/database'

interface TicketFormProps {
  onClose: () => void
  onSuccess: (message: string) => void
  /** Vorausgewählte Maschine (z. B. aus Scanner / Detail) */
  initialMachineId?: string | null
  initialMachineName?: string | null
}

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
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('machine')
  const [machineId, setMachineId] = useState(initialMachineId ?? selectedMachineId ?? '')
  const [machineName, setMachineName] = useState(initialMachineName ?? '')
  const [lifecycleEntryId, setLifecycleEntryId] = useState('')
  const [referenceLabel, setReferenceLabel] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    const freeLabel = referenceLabel.trim()
    setSubmitting(true)
    setError(null)

    const result = await createTicket(
      referenceMode === 'machine'
        ? {
            machine_id: machineId,
            machine_name: machineName || 'Unbekannt',
            reference_label: null,
            description: description.trim(),
            priority,
            lifecycle_entry_id: lifecycleEntryId || null,
          }
        : {
            machine_id: null,
            machine_name: freeLabel,
            reference_label: freeLabel,
            description: description.trim(),
            priority,
            lifecycle_entry_id: null,
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
        : lifecycleEntryId
          ? 'Störung gemeldet und mit Lebenszyklus verknüpft.'
          : 'Störung erfolgreich gemeldet.',
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">Störung melden</h3>
        {!isOnline && (
          <p className="text-kwd-warning mt-2 text-sm font-medium">
            Offline-Modus – Meldung wird lokal gespeichert.
          </p>
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
              onClick={() => {
                setReferenceMode('free')
                setLifecycleEntryId('')
              }}
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
          <>
            <div className="mt-4">
              <MachineSearchSelect
                value={machineId}
                required
                onChange={(id, machine) => {
                  setMachineId(id)
                  setMachineName(machine?.name ?? '')
                  setLifecycleEntryId('')
                }}
              />
            </div>
            <LifecycleRepairSelect
              machineId={machineId || null}
              value={lifecycleEntryId}
              onChange={(entryId, entry) => {
                setLifecycleEntryId(entryId)
                if (entry && !description.trim()) {
                  setDescription(
                    `${entry.title}${entry.description ? `\n${entry.description}` : ''}`,
                  )
                }
              }}
            />
          </>
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
            placeholder="Was ist passiert?"
            className="bg-kwd-bg border-kwd-surface-light mt-1 w-full rounded-xl border px-4 py-3 text-base"
          />
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
            disabled={submitting || !canSubmit}
            className="bg-kwd-primary text-kwd-bg min-h-[52px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {submitting ? 'Speichern…' : 'Melden'}
          </button>
        </div>
      </form>
    </div>
  )
}
