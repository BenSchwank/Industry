import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MachineSearchSelect } from '../machines/MachineSearchSelect'
import { useAddLifecycleEntry } from '../../hooks/useMachineLifecycle'
import { createTicket } from '../../lib/syncTickets'
import { useAppStore } from '../../stores/appStore'

interface PlannedRepairFormProps {
  onClose: () => void
  onSuccess: (message: string) => void
}

type RefMode = 'machine' | 'free'

/**
 * Geplante Reparatur anlegen: Maschine oder eigener Bezugspunkt, Termin optional.
 */
export function PlannedRepairForm({ onClose, onSuccess }: PlannedRepairFormProps) {
  const isOnline = useAppStore((s) => s.isOnline)
  const queryClient = useQueryClient()
  const addEntry = useAddLifecycleEntry()

  const [refMode, setRefMode] = useState<RefMode>('machine')
  const [machineId, setMachineId] = useState('')
  const [machineName, setMachineName] = useState('')
  const [freeLabel, setFreeLabel] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit =
    Boolean(title.trim()) &&
    Boolean(dueDate.trim()) &&
    (refMode === 'machine' ? Boolean(machineId) : Boolean(freeLabel.trim()))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)

    const cleanTitle = title.trim()
    const cleanDesc = description.trim()
    const due = dueDate.trim() || null

    try {
      if (refMode === 'machine') {
        await addEntry.mutateAsync({
          machine_id: machineId,
          entry_type: 'repair',
          title: cleanTitle,
          description: cleanDesc || null,
          next_due_date: due,
        })
        void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
        void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
        void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
        onSuccess('Geplante Reparatur mit Termin angelegt.')
        onClose()
        return
      }

      // Eigener Bezugspunkt → als offene Störung/Meldung unter Reparaturen sichtbar
      const bodyParts = [cleanTitle]
      if (due) {
        bodyParts.push(
          `Geplanter Termin: ${new Date(`${due}T12:00:00`).toLocaleDateString('de-DE')}`,
        )
      }
      if (cleanDesc) bodyParts.push(cleanDesc)

      const result = await createTicket(
        {
          machine_id: null,
          machine_name: freeLabel.trim(),
          reference_label: freeLabel.trim(),
          description: bodyParts.join('\n'),
          priority: 'medium',
          lifecycle_entry_id: null,
        },
        isOnline,
      )

      if (result.mode === 'error') {
        setError(result.message ?? 'Speichern fehlgeschlagen')
        setSubmitting(false)
        return
      }

      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
      void queryClient.invalidateQueries({ queryKey: ['maintenance-free-repairs'] })
      void queryClient.invalidateQueries({ queryKey: ['maintenance-linked-tickets'] })
      onSuccess(
        result.mode === 'queued'
          ? 'Offline gespeichert – wird synchronisiert.'
          : 'Geplante Reparatur mit eigenem Bezugspunkt angelegt.',
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-kwd-surface border-kwd-border text-kwd-text max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-bold">Geplante Reparatur</h3>
        <p className="text-kwd-muted mt-1 text-sm">
          Mit Maschine oder eigenem Bezugspunkt – Monteur-Termin optional.
        </p>

        <fieldset className="mt-4">
          <legend className="text-kwd-muted text-sm font-medium">Bezug</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRefMode('machine')}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                refMode === 'machine'
                  ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                  : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
              }`}
            >
              Maschine
            </button>
            <button
              type="button"
              onClick={() => setRefMode('free')}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                refMode === 'free'
                  ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                  : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
              }`}
            >
              Eigener Bezugspunkt
            </button>
          </div>
        </fieldset>

        {refMode === 'machine' ? (
          <div className="mt-4">
            <span className="text-kwd-muted text-sm font-medium">Maschine</span>
            <div className="mt-1">
              <MachineSearchSelect
                value={machineId}
                onChange={(id, m) => {
                  setMachineId(id)
                  setMachineName(m?.name ?? '')
                }}
                required
              />
            </div>
            {machineName && (
              <p className="text-kwd-muted mt-1 text-xs">{machineName}</p>
            )}
          </div>
        ) : (
          <label className="mt-4 block">
            <span className="text-kwd-muted text-sm font-medium">Bezugspunkt</span>
            <input
              type="text"
              value={freeLabel}
              onChange={(e) => setFreeLabel(e.target.value)}
              required
              placeholder="z.B. Halle 2, Förderband, Extern…"
              className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Titel</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="z.B. Spindel tauschen, Monteur bestellt…"
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Monteur-Termin</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4 text-base"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-kwd-muted text-sm font-medium">Beschreibung (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-kwd-bg border-kwd-surface-light mt-1 w-full rounded-xl border px-4 py-3 text-base"
          />
        </label>

        {error && <p className="text-kwd-danger mt-3 text-sm font-medium">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-kwd-surface-light min-h-[48px] flex-1 rounded-xl font-semibold"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="bg-kwd-primary text-kwd-bg min-h-[48px] flex-1 rounded-xl font-bold disabled:opacity-50"
          >
            {submitting ? 'Speichern…' : 'Anlegen'}
          </button>
        </div>
      </form>
    </div>
  )
}
