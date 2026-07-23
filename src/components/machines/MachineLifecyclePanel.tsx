import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import {
  useAddLifecycleEntry,
  useDeleteTimelineEntries,
  type TimelineItem,
} from '../../hooks/useMachineLifecycle'
import {
  assertLifecycleImage,
  useLifecyclePhotosForMachine,
  useUploadLifecyclePhotos,
  type LifecyclePhoto,
} from '../../hooks/useLifecyclePhotos'
import { formatSupabaseError } from '../../lib/formatError'
import {
  addDaysIso,
  formatDurationDays,
  maintenanceDueClass,
  maintenanceDueTone,
  type DurationUnit,
} from '../../lib/maintenanceDue'
import type { LifecycleEntryType } from '../../types/database'
import { DurationUnitField, parseDurationInput } from '../ui/DurationUnitField'
import { Tip } from '../ui/Tip'
import {
  LifecycleImagePickButtons,
  LifecyclePhotoPicker,
  LifecyclePhotoStrip,
  PendingPhotoStrip,
} from './LifecyclePhotos'

const ENTRY_TYPES: { value: LifecycleEntryType; label: string }[] = [
  { value: 'maintenance', label: 'Hauptuntersuchung' },
  { value: 'repair', label: 'Reparatur' },
  { value: 'inspection', label: 'Inspektion' },
  { value: 'note', label: 'Notiz' },
]

const LIST_SECTIONS: { type: string; label: string }[] = [
  { type: 'maintenance', label: 'Hauptuntersuchungen' },
  { type: 'repair', label: 'Reparaturen' },
  { type: 'inspection', label: 'Inspektionen' },
  { type: 'ticket', label: 'Störungen' },
  { type: 'note', label: 'Notizen' },
]

function itemKey(item: TimelineItem) {
  return `${item.source}:${item.id}`
}

function sortByDateDesc(a: TimelineItem, b: TimelineItem) {
  return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
}

interface MachineLifecyclePanelProps {
  machineId: string
  machineName: string
  timeline: TimelineItem[]
  isLoading: boolean
  hideHeaderActions?: boolean
}

export function MachineLifecyclePanel({
  machineId,
  machineName,
  timeline,
  isLoading,
  hideHeaderActions,
}: MachineLifecyclePanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [entryType, setEntryType] = useState<LifecycleEntryType>('maintenance')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10))
  const [durationValue, setDurationValue] = useState('90')
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('days')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [maximized, setMaximized] = useState<TimelineItem | null>(null)
  const [formPreviewOpen, setFormPreviewOpen] = useState(false)
  const lastClickedIndex = useRef<number | null>(null)

  const addEntry = useAddLifecycleEntry()
  const deleteEntries = useDeleteTimelineEntries()
  const uploadPhotos = useUploadLifecyclePhotos()
  const { data: allPhotos = [] } = useLifecyclePhotosForMachine(machineId)

  const photosByEntry = useMemo(() => {
    const map = new Map<string, LifecyclePhoto[]>()
    for (const p of allPhotos) {
      const list = map.get(p.entry_id) ?? []
      list.push(p)
      map.set(p.entry_id, list)
    }
    return map
  }, [allPhotos])

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineItem[]>()
    for (const item of [...timeline].sort(sortByDateDesc)) {
      const key = item.entry_type
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return map
  }, [timeline])

  function openForm(type: LifecycleEntryType = 'maintenance') {
    setEntryType(type)
    setTitle(type === 'maintenance' ? 'Hauptuntersuchung' : '')
    setDescription('')
    setOccurredAt(new Date().toISOString().slice(0, 10))
    setDurationValue('90')
    setDurationUnit('days')
    setPendingPhotos([])
    setError(null)
    setShowForm(true)
  }

  const parsedDuration = parseDurationInput(durationValue, durationUnit)
  const nextDuePreview =
    entryType === 'maintenance' && parsedDuration.ok
      ? addDaysIso(occurredAt, parsedDuration.days)
      : null

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
    setError(null)
    if (!title.trim()) {
      setError('Titel ist Pflicht.')
      return
    }
    let days: number | null = null
    if (entryType === 'maintenance') {
      const parsed = parseDurationInput(durationValue, durationUnit)
      if (!parsed.ok) {
        setError('Bitte die Dauer angeben (mind. 1 Tag bzw. 1 Jahr).')
        return
      }
      days = parsed.days
    }
    try {
      const entry = await addEntry.mutateAsync({
        machine_id: machineId,
        entry_type: entryType,
        title: title.trim(),
        description: description.trim() || null,
        occurred_at: new Date(occurredAt).toISOString(),
        duration_days: days,
      })
      if (pendingPhotos.length > 0 && entry?.id) {
        try {
          await uploadPhotos.mutateAsync({
            machineId,
            entryId: entry.id,
            files: pendingPhotos,
          })
        } catch (photoErr) {
          setError(
            photoErr instanceof Error
              ? `Eintrag gespeichert, Fotos fehlgeschlagen: ${photoErr.message}. Migration 010 ausführen?`
              : 'Eintrag gespeichert, Foto-Upload fehlgeschlagen.',
          )
          setTitle('')
          setDescription('')
          setPendingPhotos([])
          setShowForm(false)
          return
        }
      }
      setTitle('')
      setDescription('')
      setPendingPhotos([])
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? formatSupabaseError(err) : 'Speichern fehlgeschlagen')
    }
  }

  function toggleSelect(index: number, key: string, e: MouseEvent) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (e.shiftKey && lastClickedIndex.current !== null) {
        const from = Math.min(lastClickedIndex.current, index)
        const to = Math.max(lastClickedIndex.current, index)
        for (let i = from; i <= to; i++) next.add(itemKey(timeline[i]))
      } else if (next.has(key)) next.delete(key)
      else next.add(key)
      lastClickedIndex.current = index
      return next
    })
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (
      !window.confirm(
        selected.size === 1
          ? 'Diesen Eintrag wirklich löschen?'
          : `${selected.size} Einträge wirklich löschen?`,
      )
    ) {
      return
    }
    setError(null)
    const targets = timeline
      .filter((item) => selected.has(itemKey(item)))
      .map((item) => ({ id: item.id, source: item.source }))
    try {
      await deleteEntries.mutateAsync({ machineId, targets })
      setSelected(new Set())
      lastClickedIndex.current = null
    } catch (err) {
      setError(
        err instanceof Error
          ? formatSupabaseError(err)
          : 'Löschen fehlgeschlagen. Bitte supabase/FIX_DELETE_TIMELINE.sql ausführen.',
      )
    }
  }

  async function deleteOne(item: TimelineItem) {
    if (!window.confirm(`Eintrag „${item.title}“ löschen?`)) return
    setError(null)
    try {
      await deleteEntries.mutateAsync({
        machineId,
        targets: [{ id: item.id, source: item.source }],
      })
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(itemKey(item))
        return next
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? formatSupabaseError(err)
          : 'Löschen fehlgeschlagen. Bitte supabase/FIX_DELETE_TIMELINE.sql ausführen.',
      )
    }
  }

  const fieldCls =
    'border-kwd-border bg-kwd-paper text-kwd-text mt-1 min-h-[40px] w-full border px-3 text-sm'
  const saving = addEntry.isPending || uploadPhotos.isPending

  return (
    <div className="flex flex-col gap-3">
      <section className="kwd-panel">
        <div className="kwd-panel-head flex flex-wrap items-center justify-between gap-2">
          <span>Lebenszyklus · {machineName}</span>
          <div className="flex flex-wrap gap-1.5 font-normal normal-case tracking-normal">
            {selected.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void deleteSelected()}
                  disabled={deleteEntries.isPending}
                  className="kwd-btn kwd-btn-danger"
                >
                  {selected.size} löschen
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="kwd-btn">
                  Auswahl aufheben
                </button>
              </>
            )}
            {!hideHeaderActions && (
              <>
                <button
                  type="button"
                  onClick={() => openForm('maintenance')}
                  className="kwd-btn kwd-btn-primary"
                >
                  + Hauptuntersuchung
                </button>
                <button type="button" onClick={() => openForm('repair')} className="kwd-btn">
                  + Reparatur
                </button>
                <button type="button" onClick={() => openForm('inspection')} className="kwd-btn">
                  + Inspektion
                </button>
                <button type="button" onClick={() => openForm('note')} className="kwd-btn">
                  + Notiz
                </button>
              </>
            )}
          </div>
        </div>

        <Tip>
          <p className="text-kwd-muted border-kwd-border border-b px-3 py-2 text-xs">
            Hauptuntersuchung: Dauer in Tagen oder Jahren → nächste Fälligkeit (gelb ≤ 3 Monate, rot
            überfällig).
          </p>
        </Tip>

        {showForm && (
          <form onSubmit={handleSubmit} className="border-kwd-border border-b p-3">
            <p className="mb-2 text-sm font-semibold">
              {entryType === 'maintenance'
                ? 'Hauptuntersuchung hinzufügen'
                : `${ENTRY_TYPES.find((t) => t.value === entryType)?.label ?? 'Eintrag'} hinzufügen`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {entryType !== 'maintenance' && (
                <label className="block">
                  <span className="kwd-kpi-label">Typ</span>
                  <select
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value as LifecycleEntryType)}
                    className={fieldCls}
                  >
                    {ENTRY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={`block ${entryType === 'maintenance' ? '' : ''}`}>
                <span className="kwd-kpi-label">
                  {entryType === 'maintenance' ? 'Untersuchungsdatum' : 'Datum'}
                </span>
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  required
                  className={fieldCls}
                />
              </label>
              {entryType === 'maintenance' && (
                <DurationUnitField
                  label="Dauer bis zur nächsten Hauptuntersuchung *"
                  value={durationValue}
                  unit={durationUnit}
                  onValueChange={setDurationValue}
                  onUnitChange={setDurationUnit}
                  required
                  className="block"
                  inputClassName={fieldCls}
                  hint={
                    nextDuePreview ? (
                      <p
                        className={`mt-1 text-xs ${maintenanceDueClass(nextDuePreview) || 'text-kwd-muted'}`}
                      >
                        Nächste HU: {new Date(nextDuePreview).toLocaleDateString('de-DE')}
                        {maintenanceDueTone(nextDuePreview) === 'soon' && ' · bald fällig'}
                        {maintenanceDueTone(nextDuePreview) === 'overdue' && ' · überfällig'}
                        {parsedDuration.ok && durationUnit === 'years' && (
                          <span className="text-kwd-muted">
                            {' '}
                            ({formatDurationDays(parsedDuration.days)})
                          </span>
                        )}
                      </p>
                    ) : undefined
                  }
                />
              )}
              <label className="block sm:col-span-2">
                <span className="kwd-kpi-label">Titel *</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder={
                    entryType === 'maintenance'
                      ? 'z.B. Jahres-HU, TÜV…'
                      : 'z.B. Lager getauscht…'
                  }
                  className={fieldCls}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="kwd-kpi-label">Beschreibung / Daten</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Beliebige Details: Öltyp, Messwerte, Teile, Bemerkungen…"
                  className={`${fieldCls} min-h-[100px] resize-y`}
                />
              </label>
              <div className="sm:col-span-2">
                <span className="kwd-kpi-label">Fotos (optional)</span>
                <div className="mt-1">
                  <LifecycleImagePickButtons
                    onFiles={addPendingFiles}
                    cameraLabel="Foto aufnehmen"
                    galleryLabel="Galerie / Datei"
                  />
                  <p className="text-kwd-muted mt-1 text-xs">
                    Handy: Galerie oder Dateien · bis 8 Fotos · max. 10 MB
                  </p>
                </div>
                <PendingPhotoStrip
                  files={pendingPhotos}
                  onRemove={(i) => setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                />
              </div>
            </div>
            {error && (
              <p className="text-kwd-danger bg-kwd-danger/10 border-kwd-danger mt-3 border px-3 py-2 text-sm">
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" disabled={saving} className="kwd-btn kwd-btn-primary min-h-[44px]">
                {saving ? 'Speichern…' : 'In Liste speichern'}
              </button>
              <button
                type="button"
                onClick={() => setFormPreviewOpen(true)}
                className="kwd-btn min-h-[44px]"
                title="Beschreibung und Fotos groß anzeigen"
              >
                Maximieren
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setFormPreviewOpen(false)
                }}
                className="kwd-btn min-h-[44px]"
              >
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {error && !showForm && (
          <p className="text-kwd-danger bg-kwd-danger/10 border-kwd-danger m-3 border px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {isLoading && <p className="text-kwd-muted p-4 text-sm">Lade Lebenszyklus…</p>}

        {!isLoading && timeline.length === 0 && (
          <p className="text-kwd-muted px-4 py-8 text-center text-sm">
            Noch keine Einträge – „+ Hauptuntersuchung“ nutzen und Dauer bis zur nächsten HU angeben.
          </p>
        )}
      </section>

      {!isLoading &&
        LIST_SECTIONS.map(({ type, label }) => {
          const items = grouped.get(type) ?? []
          if (items.length === 0) return null
          return (
            <section key={type} className="kwd-panel">
              <div className="kwd-panel-head">
                {label} ({items.length})
              </div>
              <ul className="divide-kwd-border divide-y">
                {items.map((item) => {
                  const key = itemKey(item)
                  const flatIndex = timeline.findIndex(
                    (t) => t.id === item.id && t.source === item.source,
                  )
                  const isSelected = selected.has(key)
                  const photos =
                    item.source === 'lifecycle' ? (photosByEntry.get(item.id) ?? []) : []
                  const dueCls = maintenanceDueClass(item.next_due_date)
                  return (
                    <li
                      key={key}
                      className={`flex gap-3 px-3 py-3 ${
                        isSelected ? 'bg-kwd-primary/10' : 'hover:bg-kwd-surface-light'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (flatIndex >= 0) toggleSelect(flatIndex, key, e)
                        }}
                        onChange={() => {}}
                        className="accent-kwd-primary mt-1 h-4 w-4 shrink-0"
                        aria-label={`${item.title} auswählen`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-kwd-muted text-xs font-semibold tabular-nums">
                          {new Date(item.occurred_at).toLocaleDateString('de-DE')}
                          {item.source === 'ticket' && ' · Störung'}
                          {item.source === 'completion' && ' · Checkliste'}
                          {item.source === 'lifecycle' && ' · Manuell'}
                          {item.created_by_username && (
                            <span className="text-kwd-primary"> · {item.created_by_username}</span>
                          )}
                        </p>
                        <p className="font-semibold">{item.title}</p>
                        {(item.duration_days || item.next_due_date) && (
                          <p className="mt-0.5 text-sm">
                            {item.duration_days != null && (
                              <span className="text-kwd-muted">
                                Dauer: {formatDurationDays(item.duration_days)}
                              </span>
                            )}
                            {item.duration_days != null && item.next_due_date && ' · '}
                            {item.next_due_date && (
                              <span className={dueCls || 'text-kwd-muted'}>
                                Nächste:{' '}
                                {new Date(item.next_due_date).toLocaleDateString('de-DE')}
                                {maintenanceDueTone(item.next_due_date) === 'soon' && ' (bald)'}
                                {maintenanceDueTone(item.next_due_date) === 'overdue' &&
                                  ' (überfällig)'}
                              </span>
                            )}
                          </p>
                        )}
                        {item.description && (
                          <p className="text-kwd-muted mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm">
                            {item.description}
                          </p>
                        )}
                        <LifecyclePhotoStrip photos={photos} canDelete={item.source === 'lifecycle'} />
                        {item.source === 'lifecycle' && (
                          <LifecyclePhotoPicker machineId={machineId} entryId={item.id} />
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 self-start">
                        <button
                          type="button"
                          onClick={() => setMaximized(item)}
                          className="kwd-btn min-h-[40px]"
                          title="Eintrag maximieren"
                        >
                          Maximieren
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteOne(item)}
                          disabled={deleteEntries.isPending}
                          className="kwd-btn kwd-btn-danger"
                        >
                          Löschen
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

      {maximized && (
        <LifecycleEntryMaximizeModal
          item={
            timeline.find((t) => t.id === maximized.id && t.source === maximized.source) ??
            maximized
          }
          photos={
            maximized.source === 'lifecycle'
              ? (photosByEntry.get(maximized.id) ?? [])
              : []
          }
          machineId={machineId}
          onClose={() => setMaximized(null)}
          onDelete={() => {
            const item =
              timeline.find((t) => t.id === maximized.id && t.source === maximized.source) ??
              maximized
            setMaximized(null)
            void deleteOne(item)
          }}
          deleting={deleteEntries.isPending}
        />
      )}

      {formPreviewOpen && showForm && (
        <LifecycleFormPreviewModal
          title={title || 'Neuer Eintrag'}
          description={description}
          occurredAt={occurredAt}
          entryType={entryType}
          pendingPhotos={pendingPhotos}
          onClose={() => setFormPreviewOpen(false)}
        />
      )}
    </div>
  )
}

function entryTypeLabel(type: string) {
  return ENTRY_TYPES.find((t) => t.value === type)?.label ?? type
}

function LifecycleEntryMaximizeModal({
  item,
  photos,
  machineId,
  onClose,
  onDelete,
  deleting,
}: {
  item: TimelineItem
  photos: LifecyclePhoto[]
  machineId: string
  onClose: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const dueCls = maintenanceDueClass(item.next_due_date)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal
      aria-label="Eintrag maximiert"
      onClick={onClose}
    >
      <div
        className="bg-kwd-paper border-kwd-border mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-kwd-border flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-kwd-muted text-xs font-semibold tabular-nums">
              {new Date(item.occurred_at).toLocaleString('de-DE')}
              {item.source === 'ticket' && ' · Störung'}
              {item.source === 'completion' && ' · Checkliste'}
              {item.source === 'lifecycle' && ' · Manuell'}
              {item.created_by_username && (
                <span className="text-kwd-primary"> · {item.created_by_username}</span>
              )}
            </p>
            <h3 className="text-lg font-bold leading-snug break-words">{item.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="kwd-btn min-h-[44px] min-w-[44px] shrink-0 text-lg"
            aria-label="Schließen"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {(item.duration_days || item.next_due_date) && (
            <p className="text-sm">
              {item.duration_days != null && (
                <span className="text-kwd-muted">
                  Dauer: {formatDurationDays(item.duration_days)}
                </span>
              )}
              {item.duration_days != null && item.next_due_date && ' · '}
              {item.next_due_date && (
                <span className={dueCls || 'text-kwd-muted'}>
                  Nächste: {new Date(item.next_due_date).toLocaleDateString('de-DE')}
                </span>
              )}
            </p>
          )}

          <section>
            <h4 className="kwd-kpi-label">Beschreibung</h4>
            {item.description?.trim() ? (
              <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed">
                {item.description}
              </p>
            ) : (
              <p className="text-kwd-muted mt-1 text-sm">Keine Beschreibung</p>
            )}
          </section>

          <section>
            <h4 className="kwd-kpi-label">Fotos ({photos.length})</h4>
            {photos.length > 0 ? (
              <LifecyclePhotoStrip
                photos={photos}
                canDelete={item.source === 'lifecycle'}
                size="lg"
              />
            ) : (
              <p className="text-kwd-muted mt-1 text-sm">Noch keine Fotos</p>
            )}
            {item.source === 'lifecycle' && (
              <div className="mt-3">
                <LifecyclePhotoPicker machineId={machineId} entryId={item.id} />
              </div>
            )}
          </section>
        </div>

        <footer className="border-kwd-border flex flex-wrap gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="kwd-btn kwd-btn-primary min-h-[44px]">
            Schließen
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="kwd-btn kwd-btn-danger min-h-[44px]"
          >
            Löschen
          </button>
        </footer>
      </div>
    </div>
  )
}

function LifecycleFormPreviewModal({
  title,
  description,
  occurredAt,
  entryType,
  pendingPhotos,
  onClose,
}: {
  title: string
  description: string
  occurredAt: string
  entryType: LifecycleEntryType
  pendingPhotos: File[]
  onClose: () => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal
      aria-label="Vorschau vor dem Speichern"
      onClick={onClose}
    >
      <div
        className="bg-kwd-paper border-kwd-border mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-kwd-border flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-kwd-muted text-xs font-semibold">
              Vorschau · {entryTypeLabel(entryType)} ·{' '}
              {new Date(`${occurredAt}T12:00:00`).toLocaleDateString('de-DE')}
            </p>
            <h3 className="text-lg font-bold leading-snug break-words">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="kwd-btn min-h-[44px] min-w-[44px] shrink-0 text-lg"
            aria-label="Schließen"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section>
            <h4 className="kwd-kpi-label">Beschreibung</h4>
            {description.trim() ? (
              <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed">{description}</p>
            ) : (
              <p className="text-kwd-muted mt-1 text-sm">Keine Beschreibung</p>
            )}
          </section>
          <section>
            <h4 className="kwd-kpi-label">Fotos ({pendingPhotos.length})</h4>
            {pendingPhotos.length > 0 ? (
              <PendingPhotoStrip files={pendingPhotos} />
            ) : (
              <p className="text-kwd-muted mt-1 text-sm">Noch keine Fotos gewählt</p>
            )}
            <p className="text-kwd-muted mt-2 text-xs">
              Zum Speichern Vorschau schließen und „In Liste speichern“ tippen.
            </p>
          </section>
        </div>
        <footer className="border-kwd-border border-t px-4 py-3">
          <button type="button" onClick={onClose} className="kwd-btn kwd-btn-primary min-h-[44px]">
            Zurück zum Formular
          </button>
        </footer>
      </div>
    </div>
  )
}
