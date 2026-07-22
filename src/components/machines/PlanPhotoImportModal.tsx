import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { analyzePlanPhotoWithAi, type PlanPhotoMachine } from '../../lib/aiPlanPhotoAnalysis'
import { suggestMachineBarcode } from '../../lib/barcode'
import { preparePlanPhotoForAnalysis } from '../../lib/planPhotoImage'
import { useBulkCreateMachines, type MachineInput } from '../../hooks/useMachines'
import { useIsMobile } from '../../hooks/usePlatform'
import { CategoryPickerButton } from './CategoryPickerButton'

type Step = 'capture' | 'analyzing' | 'preview' | 'done'

interface PreviewRow {
  id: string
  selected: boolean
  barcode: string
  /** Datenname – Lebenszyklus / Scan */
  name: string
  /** Name auf der Zeichnung / Menü */
  labelName: string
  location?: string | null
  category?: string | null
  confidence?: 'high' | 'medium' | 'low'
}

interface PlanPhotoImportModalProps {
  onClose: () => void
  categorySuggestions?: string[]
}

function newPreviewRow(machine: PlanPhotoMachine, defaultCategory: string): PreviewRow {
  const drawingName = machine.name.trim()
  return {
    id: crypto.randomUUID(),
    selected: true,
    name: drawingName,
    labelName: drawingName,
    location: machine.location,
    category: machine.category?.trim() || defaultCategory || null,
    confidence: machine.confidence,
    barcode: suggestMachineBarcode(drawingName || 'MASCHINE'),
  }
}

function blankPreviewRow(defaultCategory: string, defaultLocation?: string | null): PreviewRow {
  return {
    id: crypto.randomUUID(),
    selected: true,
    name: '',
    labelName: '',
    location: defaultLocation ?? null,
    category: defaultCategory.trim() || null,
    confidence: 'high',
    barcode: '',
  }
}

export function PlanPhotoImportModal({
  onClose,
  categorySuggestions = [],
}: PlanPhotoImportModalProps) {
  const queryClient = useQueryClient()
  const bulkCreate = useBulkCreateMachines()
  const isMobile = useIsMobile()
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const autoCameraTriggered = useRef(false)

  const [step, setStep] = useState<Step>('capture')
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sourceLabel, setSourceLabel] = useState('')
  const [defaultCategory, setDefaultCategory] = useState('')
  const [hallName, setHallName] = useState<string | null>(null)
  const [analysisNotes, setAnalysisNotes] = useState<string | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [importResult, setImportResult] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (step !== 'capture' || !isMobile || autoCameraTriggered.current) return
    autoCameraTriggered.current = true
    const timer = window.setTimeout(() => cameraRef.current?.click(), 350)
    return () => window.clearTimeout(timer)
  }, [step, isMobile])

  async function handlePhoto(file: File) {
    setError(null)
    setStep('analyzing')
    setSourceLabel(file.name || 'Kamera-Aufnahme')

    try {
      const prepared = await preparePlanPhotoForAnalysis(file)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(prepared.previewUrl)

      try {
        const result = await analyzePlanPhotoWithAi(prepared.base64, prepared.mime)
        setHallName(result.hallName ?? null)
        setAnalysisNotes(result.notes ?? null)

        const nextRows =
          result.machines.length > 0
            ? result.machines.map((m) =>
                newPreviewRow(
                  {
                    ...m,
                    location: m.location || result.hallName || null,
                  },
                  defaultCategory,
                ),
              )
            : [blankPreviewRow(defaultCategory, result.hallName)]
        setRows(nextRows)
        setStep('preview')
        if (result.machines.length === 0) {
          setError(
            'Keine Maschinen erkannt – Tabelle ist leer, bitte Zeilen manuell ergänzen.',
          )
        }
      } catch (aiErr) {
        // Foto bleibt – manuell in Vorschau eintragen
        setHallName(null)
        setAnalysisNotes(null)
        setRows([
          blankPreviewRow(defaultCategory),
          blankPreviewRow(defaultCategory),
          blankPreviewRow(defaultCategory),
        ])
        setStep('preview')
        setError(
          (aiErr instanceof Error ? aiErr.message : 'Analyse fehlgeschlagen') +
            ' · Foto bleibt – bitte Maschinen unten manuell eintragen.',
        )
      }
    } catch (err) {
      setStep('capture')
      setError(err instanceof Error ? err.message : 'Bild konnte nicht geladen werden')
    }
  }

  function updateRow(id: string, patch: Partial<PreviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function toggleAll(selected: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected })))
  }

  function addRow(afterId?: string) {
    const next = blankPreviewRow(defaultCategory, hallName)
    setRows((prev) => {
      if (!afterId) return [...prev, next]
      const idx = prev.findIndex((r) => r.id === afterId)
      if (idx < 0) return [...prev, next]
      const copy = [...prev]
      copy.splice(idx + 1, 0, next)
      return copy
    })
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id)
      return next.length > 0 ? next : [blankPreviewRow(defaultCategory, hallName)]
    })
  }

  function duplicateRow(id: string) {
    setRows((prev) => {
      const src = prev.find((r) => r.id === id)
      if (!src) return prev
      const copy: PreviewRow = {
        ...src,
        id: crypto.randomUUID(),
        barcode: src.name.trim()
          ? suggestMachineBarcode(`${src.name.trim()}-KOPIE`)
          : '',
      }
      const idx = prev.findIndex((r) => r.id === id)
      const list = [...prev]
      list.splice(idx + 1, 0, copy)
      return list
    })
  }

  async function handleImport() {
    const selected = rows.filter((r) => r.selected && r.name.trim())
    if (selected.length === 0) {
      setError('Mindestens eine Maschine mit Bezeichnung auswählen.')
      return
    }

    setError(null)
    const inputs: MachineInput[] = selected.map((r) => ({
      barcode: r.barcode.trim() || suggestMachineBarcode(r.name),
      name: r.name.trim(),
      label_name: r.labelName.trim() || null,
      location: (r.location ?? '').trim() || 'Unbekannt',
      category: r.category?.trim() || defaultCategory.trim() || null,
      status: 'active',
    }))

    try {
      const { results, errors } = await bulkCreate.mutateAsync(inputs)
      await queryClient.invalidateQueries({ queryKey: ['machines'] })
      await queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
      await queryClient.invalidateQueries({ queryKey: ['overview-stats'] })

      setImportResult(
        `${results.length} Maschine${results.length === 1 ? '' : 'n'} angelegt` +
          (errors.length ? ` · ${errors.length} Fehler` : ''),
      )
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen')
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 lg:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-photo-import-title"
    >
      <div className="bg-kwd-surface border-kwd-surface-light flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
        <header className="border-kwd-surface-light flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 lg:px-6">
          <div>
            <p className="text-kwd-primary text-xs font-bold uppercase tracking-widest">
              Plan-Foto
            </p>
            <h2 id="plan-photo-import-title" className="text-xl font-bold lg:text-2xl">
              {step === 'capture' && 'Plan fotografieren'}
              {step === 'analyzing' && 'Plan wird ausgelesen…'}
              {step === 'preview' && 'Maschinen prüfen & bearbeiten'}
              {step === 'done' && 'Import abgeschlossen'}
            </h2>
            {sourceLabel && step !== 'capture' && (
              <p className="text-kwd-muted mt-1 text-sm">Quelle: {sourceLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-kwd-muted hover:text-kwd-text min-h-[44px] rounded-lg px-3 text-sm font-semibold"
          >
            Schließen ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6">
          {step === 'capture' && (
            <div className="flex flex-col gap-6 lg:flex-row">
              <section className="bg-kwd-bg flex flex-1 flex-col rounded-xl p-5">
                <h3 className="font-bold">Kamera oder Galerie</h3>
                <p className="text-kwd-muted mt-1 text-sm">
                  Hängenden Hallenplan, Anlagenliste oder Wandtafel fotografieren – die KI liest
                  Bezeichnungen und Standorte aus.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="kwd-btn kwd-btn-primary min-h-[44px] flex-1"
                  >
                    Foto aufnehmen
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="kwd-btn min-h-[44px] flex-1"
                  >
                    Bild auswählen
                  </button>
                </div>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handlePhoto(f)
                    e.target.value = ''
                  }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handlePhoto(f)
                    e.target.value = ''
                  }}
                />
              </section>

              <section className="bg-kwd-bg flex flex-1 flex-col rounded-xl p-5">
                <h3 className="font-bold">Standard-Kategorie (optional)</h3>
                <p className="text-kwd-muted mt-1 text-sm">
                  Alle erkannten Geräte landen in dieser Kategorie, wenn am Plan nichts anderes
                  steht.
                </p>
                <div className="mt-4">
                  <CategoryPickerButton
                    value={defaultCategory}
                    suggestions={categorySuggestions}
                    buttonLabel={defaultCategory || 'Kategorie wählen'}
                    title="Standard-Kategorie für Import"
                    onChange={(c) => setDefaultCategory(c.trim())}
                  />
                </div>
                <p className="text-kwd-muted mt-4 text-xs leading-relaxed">
                  Tipp: Plan gerade fotografieren, gute Beleuchtung, Text scharf. Benötigt{' '}
                  <code className="text-kwd-text">VITE_OPENAI_API_KEY</code> in Vercel mit
                  ausreichend OpenAI-Guthaben (Billing unter platform.openai.com).
                </p>
              </section>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center gap-4 py-10">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Plan-Vorschau"
                  className="border-kwd-border max-h-48 max-w-full rounded-lg border object-contain"
                />
              )}
              <p className="text-kwd-muted text-sm">Maschinen werden erkannt…</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Plan-Vorschau"
                    className="border-kwd-border max-h-40 max-w-full shrink-0 rounded-lg border object-contain lg:max-w-[240px]"
                  />
                )}
                <div className="flex flex-1 flex-col gap-2">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <SummaryCard label="Erkannt" value={rows.length} />
                    <SummaryCard label="Ausgewählt" value={selectedCount} highlight="success" />
                    {hallName && <SummaryCard label="Halle/Bereich" value={hallName} text />}
                  </div>
                  {analysisNotes && (
                    <p className="text-kwd-muted text-xs">{analysisNotes}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => toggleAll(true)} className="kwd-btn text-xs">
                      Alle
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAll(false)}
                      className="kwd-btn text-xs"
                    >
                      Keine
                    </button>
                    <button
                      type="button"
                      onClick={() => addRow()}
                      className="kwd-btn kwd-btn-primary text-xs"
                    >
                      + Zeile
                    </button>
                    <CategoryPickerButton
                      value={defaultCategory}
                      suggestions={categorySuggestions}
                      buttonLabel={
                        defaultCategory
                          ? `Alle → ${defaultCategory}`
                          : 'Kategorie für Auswahl'
                      }
                      title="Kategorie auf markierte Zeilen anwenden"
                      onChange={(c) => {
                        const next = c.trim()
                        setDefaultCategory(next)
                        setRows((prev) =>
                          prev.map((r) => (r.selected ? { ...r, category: next || r.category } : r)),
                        )
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setStep('capture')}
                      className="kwd-btn text-xs"
                    >
                      Anderes Foto
                    </button>
                  </div>
                  <p className="text-kwd-muted text-xs">
                    Felder direkt in der Tabelle ändern · fehlende Maschinen mit „+ Zeile“ ergänzen
                  </p>
                </div>
              </div>

              <div className="border-kwd-surface-light overflow-hidden rounded-xl border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-kwd-surface-light text-kwd-muted text-left text-xs font-bold uppercase">
                        <th className="border-kwd-surface-light w-10 border px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedCount === rows.length && rows.length > 0}
                            onChange={(e) => toggleAll(e.target.checked)}
                            className="accent-kwd-primary h-4 w-4"
                            aria-label="Alle auswählen"
                          />
                        </th>
                        <th className="border-kwd-surface-light border px-3 py-2">Bezeichnung</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Standort</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Kategorie</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Scan-Code</th>
                        <th className="border-kwd-surface-light w-28 border px-2 py-2"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr
                          key={row.id}
                          className={`${idx % 2 === 0 ? 'bg-kwd-bg/50' : ''} ${
                            row.selected ? '' : 'opacity-50'
                          }`}
                        >
                          <td className="border-kwd-surface-light border px-2 py-1">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) => updateRow(row.id, { selected: e.target.checked })}
                              className="accent-kwd-primary h-4 w-4"
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-2 py-1">
                            <input
                              value={row.name}
                              onChange={(e) => {
                                const next = e.target.value
                                updateRow(row.id, {
                                  name: next,
                                  labelName: row.labelName || next,
                                  barcode:
                                    !row.barcode.trim() ||
                                    row.barcode ===
                                      suggestMachineBarcode(row.name || row.labelName || 'MASCHINE')
                                      ? next.trim()
                                        ? suggestMachineBarcode(next)
                                        : ''
                                      : row.barcode,
                                })
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && idx === rows.length - 1) {
                                  e.preventDefault()
                                  addRow(row.id)
                                }
                              }}
                              placeholder="Maschinenname…"
                              className="bg-transparent w-full min-w-[10rem] border-0 px-1 py-1.5 text-sm focus:outline-none"
                              title="Bezeichnung"
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-2 py-1">
                            <input
                              value={row.location ?? ''}
                              onChange={(e) => updateRow(row.id, { location: e.target.value })}
                              placeholder="Standort…"
                              className="bg-transparent w-full min-w-[8rem] border-0 px-1 py-1.5 text-sm focus:outline-none"
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-2 py-1">
                            <input
                              value={row.category ?? ''}
                              onChange={(e) => updateRow(row.id, { category: e.target.value })}
                              placeholder="Kategorie…"
                              list="plan-photo-category-suggestions"
                              className="bg-transparent w-full min-w-[8rem] border-0 px-1 py-1.5 text-sm focus:outline-none"
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-2 py-1">
                            <input
                              value={row.barcode}
                              onChange={(e) => updateRow(row.id, { barcode: e.target.value })}
                              placeholder="Scan-Code…"
                              className="bg-transparent w-full min-w-[8rem] border-0 px-1 py-1.5 font-mono text-xs focus:outline-none"
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => addRow(row.id)}
                                className="kwd-btn min-h-[36px] px-2 text-xs"
                                title="Zeile darunter einfügen"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateRow(row.id)}
                                className="kwd-btn min-h-[36px] px-2 text-xs"
                                title="Zeile duplizieren"
                              >
                                ⧉
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRow(row.id)}
                                className="text-kwd-danger hover:bg-kwd-danger/10 min-h-[36px] rounded px-2 text-xs font-semibold"
                                title="Zeile löschen"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-kwd-primary/10">
                        <td colSpan={6} className="border-kwd-surface-light border px-3 py-2">
                          <button
                            type="button"
                            onClick={() => addRow()}
                            className="kwd-btn kwd-btn-primary min-h-[40px] w-full text-sm font-bold sm:w-auto"
                          >
                            + Zeile hinzufügen
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <datalist id="plan-photo-category-suggestions">
                    {categorySuggestions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && importResult && (
            <div className="bg-kwd-success/10 border-kwd-success/30 rounded-xl border p-6 text-center">
              <p className="text-lg font-bold">{importResult}</p>
              <p className="text-kwd-muted mt-2 text-sm">
                Die Maschinen erscheinen jetzt in der Liste – Scan-Codes können Sie dort anpassen.
              </p>
            </div>
          )}

          {error && (
            <div className="border-kwd-danger bg-kwd-danger/10 mt-4 rounded-xl border p-4">
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        <footer className="border-kwd-surface-light flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-4 lg:px-6">
          {step === 'preview' && (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={bulkCreate.isPending || selectedCount === 0}
              className="kwd-btn kwd-btn-primary min-h-[44px] px-6"
            >
              {bulkCreate.isPending
                ? 'Wird importiert…'
                : `${selectedCount} Maschine${selectedCount === 1 ? '' : 'n'} anlegen`}
            </button>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className="kwd-btn kwd-btn-primary min-h-[44px]">
              Fertig
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
  text,
}: {
  label: string
  value: number | string
  highlight?: 'success'
  text?: boolean
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight === 'success'
          ? 'border-kwd-success/40 bg-kwd-success/10'
          : 'border-kwd-surface-light bg-kwd-bg'
      }`}
    >
      <p className="text-kwd-muted text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className={`mt-1 font-bold ${text ? 'text-sm' : 'text-2xl tabular-nums'}`}>{value}</p>
    </div>
  )
}
