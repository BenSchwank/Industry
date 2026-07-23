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
  name: string
  labelName: string
  location?: string | null
  category?: string | null
  lastMaintenance: string
  nextMaintenance: string
  lastMaintenanceCode: string
  nextMaintenanceCode: string
  lastCuttingOil: string
  nextCuttingOil: string
  lastHydraulicOil: string
  nextHydraulicOil: string
  lastHydraulicCode: string
  confidence?: 'high' | 'medium' | 'low'
}

interface PlanPhotoImportModalProps {
  onClose: () => void
  categorySuggestions?: string[]
}

const dateInputCls =
  'bg-transparent w-full min-w-[7.5rem] border-0 px-1 py-1.5 text-xs focus:outline-none'
const textInputCls =
  'bg-transparent w-full border-0 px-1 py-1.5 text-sm focus:outline-none'
const codeInputCls =
  'bg-transparent w-full min-w-[2.5rem] max-w-[3.5rem] border-0 px-1 py-1.5 text-center text-xs font-bold uppercase focus:outline-none'

function newPreviewRow(
  machine: PlanPhotoMachine,
  defaultCategory: string,
  uniqueKey = 0,
): PreviewRow {
  const drawingName = machine.name.trim()
  const number = machine.machine_number?.trim() || ''
  return {
    id: crypto.randomUUID(),
    selected: true,
    name: drawingName,
    labelName: drawingName,
    location: machine.location,
    category: machine.category?.trim() || defaultCategory || null,
    confidence: machine.confidence,
    barcode:
      number ||
      suggestMachineBarcode(`${drawingName || 'MASCHINE'}-${uniqueKey}-${Math.random()}`),
    lastMaintenance: machine.last_maintenance_at ?? '',
    nextMaintenance: machine.next_maintenance_at ?? '',
    lastMaintenanceCode: machine.last_maintenance_code ?? '',
    nextMaintenanceCode: machine.next_maintenance_code ?? '',
    lastCuttingOil: machine.last_cutting_oil_at ?? '',
    nextCuttingOil: machine.next_cutting_oil_at ?? '',
    lastHydraulicOil: machine.last_hydraulic_oil_at ?? '',
    nextHydraulicOil: machine.next_hydraulic_oil_at ?? '',
    lastHydraulicCode: machine.last_hydraulic_code ?? '',
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
    lastMaintenance: '',
    nextMaintenance: '',
    lastMaintenanceCode: '',
    nextMaintenanceCode: '',
    lastCuttingOil: '',
    nextCuttingOil: '',
    lastHydraulicOil: '',
    nextHydraulicOil: '',
    lastHydraulicCode: '',
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
            ? result.machines.map((m, i) =>
                newPreviewRow(
                  {
                    ...m,
                    location: m.location || result.hallName || null,
                  },
                  defaultCategory,
                  i,
                ),
              )
            : [blankPreviewRow(defaultCategory, result.hallName)]
        setRows(nextRows)
        setStep('preview')
        if (result.machines.length === 0) {
          setError(
            result.notes ||
              'Nichts erkannt – Tabelle unten manuell ausfüllen (wie auf dem Aushang).',
          )
        }
      } catch (aiErr) {
        setHallName(null)
        setAnalysisNotes(null)
        setRows([blankPreviewRow(defaultCategory)])
        setStep('preview')
        setError(
          aiErr instanceof Error
            ? `${aiErr.message} – Vorschau ist leer editierbar.`
            : 'Erkennung fehlgeschlagen – bitte manuell eintragen.',
        )
      }
    } catch (err) {
      setStep('capture')
      setError(err instanceof Error ? err.message : 'Foto konnte nicht gelesen werden')
    }
  }

  function updateRow(id: string, patch: Partial<PreviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function toggleAll(selected: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected })))
  }

  function addRow(afterId?: string) {
    setRows((prev) => {
      const next = blankPreviewRow(defaultCategory, hallName)
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

    // Doppelte Maschinennummern in der Auswahl eindeutig machen
    const usedCodes = new Set<string>()
    const inputs: MachineInput[] = selected.map((r, i) => {
      let code = r.barcode.trim() || suggestMachineBarcode(`${r.name}-${i}`)
      const norm = code.toUpperCase()
      if (usedCodes.has(norm)) {
        code = suggestMachineBarcode(`${r.name}-${i}-${usedCodes.size}`)
      }
      usedCodes.add(code.toUpperCase())
      return {
        barcode: code,
        name: r.name.trim(),
        label_name: r.labelName.trim() || null,
        location: (r.location ?? '').trim() || 'Unbekannt',
        category: r.category?.trim() || defaultCategory.trim() || null,
        status: 'active' as const,
        last_maintenance_at: r.lastMaintenance || null,
        next_maintenance_at: r.nextMaintenance || null,
        last_maintenance_code: r.lastMaintenanceCode.trim() || null,
        next_maintenance_code: r.nextMaintenanceCode.trim() || null,
        last_cutting_oil_at: r.lastCuttingOil || null,
        next_cutting_oil_at: r.nextCuttingOil || null,
        last_hydraulic_oil_at: r.lastHydraulicOil || null,
        next_hydraulic_oil_at: r.nextHydraulicOil || null,
        last_hydraulic_code: r.lastHydraulicCode.trim() || null,
      }
    })

    try {
      const { results, errors } = await bulkCreate.mutateAsync(inputs)
      await queryClient.invalidateQueries({ queryKey: ['machines'] })
      await queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
      await queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      await queryClient.refetchQueries({ queryKey: ['machines-with-stats'] })

      const created = results.filter((r) => !r.updated).length
      const updated = results.filter((r) => r.updated).length

      if (results.length === 0) {
        setError(
          errors.length
            ? `Nichts gespeichert:\n${errors.slice(0, 8).join('\n')}`
            : 'Nichts gespeichert – bitte erneut versuchen.',
        )
        return
      }

      setImportResult(
        [
          created ? `${created} neu angelegt` : null,
          updated ? `${updated} aktualisiert (Lebenszyklus behalten)` : null,
          errors.length ? `${errors.length} Fehler` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      )
      if (errors.length) {
        setError(errors.slice(0, 8).join('\n'))
      }
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen')
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-photo-import-title"
    >
      <div className="bg-kwd-surface border-kwd-surface-light flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
        <header className="border-kwd-surface-light flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 lg:px-6">
          <div>
            <p className="text-kwd-primary text-xs font-bold uppercase tracking-widest">
              Plan-Foto
            </p>
            <h2 id="plan-photo-import-title" className="text-xl font-bold lg:text-2xl">
              {step === 'capture' && 'Wartungsplan fotografieren'}
              {step === 'analyzing' && 'Tabelle wird ausgelesen…'}
              {step === 'preview' && 'Vorschau wie Aushang – prüfen & bearbeiten'}
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
                  Wartungsplan-Aushang fotografieren – die KI liest Maschinennummer, Wartung,
                  Schneidöl und Hydrauliköl aus.
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
                  Fallback, wenn am Plan keine Gruppe erkennbar ist. Am Plan erkannte Kategorien
                  haben Vorrang.
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
                  <code className="text-kwd-text">VITE_OPENAI_API_KEY</code> in Vercel.
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
              <p className="text-kwd-muted text-sm">
                Spalten werden ausgelesen (Maschine, Maschinennummer, Wartung, Öl)…
              </p>
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
                    Spalten wie auf dem Aushang – Werte hier korrigieren, dann importieren.
                  </p>
                </div>
              </div>

              <div className="border-kwd-surface-light overflow-hidden rounded-xl border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1600px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-kwd-surface-light text-kwd-muted text-left text-[10px] font-bold uppercase tracking-wide">
                        <th className="border-kwd-surface-light w-10 border px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedCount === rows.length && rows.length > 0}
                            onChange={(e) => toggleAll(e.target.checked)}
                            className="accent-kwd-primary h-4 w-4"
                            aria-label="Alle auswählen"
                          />
                        </th>
                        <th className="border-kwd-surface-light border px-2 py-2">Maschine</th>
                        <th className="border-kwd-surface-light border px-2 py-2">
                          Maschinennummer
                        </th>
                        <th className="border-kwd-surface-light border px-2 py-2">Kategorie</th>
                        <th className="border-kwd-surface-light border px-2 py-2">Standort</th>
                        <th className="border-kwd-surface-light border px-2 py-2">
                          letzte Wartung
                        </th>
                        <th className="border-kwd-surface-light w-12 border px-1 py-2">E/I</th>
                        <th className="border-kwd-surface-light border px-2 py-2">
                          nächste Wartung
                        </th>
                        <th className="border-kwd-surface-light w-12 border px-1 py-2">E/I</th>
                        <th className="border-kwd-surface-light border px-2 py-2">
                          letzter Schneidöl
                        </th>
                        <th className="border-kwd-surface-light border px-2 py-2">
                          nächster Schneidöl
                        </th>
                        <th className="border-kwd-surface-light border px-2 py-2">
                          letzter Hyd.-Öl
                        </th>
                        <th className="border-kwd-surface-light w-12 border px-1 py-2">W</th>
                        <th className="border-kwd-surface-light border px-2 py-2">
                          nächster Hyd.-Öl
                        </th>
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
                          <td className="border-kwd-surface-light border px-1 py-1">
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
                              placeholder="Maschine…"
                              className={`${textInputCls} min-w-[9rem]`}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              value={row.barcode}
                              onChange={(e) => updateRow(row.id, { barcode: e.target.value })}
                              placeholder="Nr…"
                              className={`${textInputCls} min-w-[6rem] font-mono text-xs`}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              value={row.category ?? ''}
                              onChange={(e) => updateRow(row.id, { category: e.target.value })}
                              placeholder="Kat…"
                              list="plan-photo-category-suggestions"
                              className={`${textInputCls} min-w-[6rem]`}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              value={row.location ?? ''}
                              onChange={(e) => updateRow(row.id, { location: e.target.value })}
                              placeholder="Standort…"
                              className={`${textInputCls} min-w-[6rem]`}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              type="date"
                              value={row.lastMaintenance}
                              onChange={(e) =>
                                updateRow(row.id, { lastMaintenance: e.target.value })
                              }
                              className={dateInputCls}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-0.5 py-1">
                            <input
                              value={row.lastMaintenanceCode}
                              onChange={(e) =>
                                updateRow(row.id, { lastMaintenanceCode: e.target.value })
                              }
                              placeholder="E"
                              className={codeInputCls}
                              title="E-extern / I-intern / IB"
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              type="date"
                              value={row.nextMaintenance}
                              onChange={(e) =>
                                updateRow(row.id, { nextMaintenance: e.target.value })
                              }
                              className={dateInputCls}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-0.5 py-1">
                            <input
                              value={row.nextMaintenanceCode}
                              onChange={(e) =>
                                updateRow(row.id, { nextMaintenanceCode: e.target.value })
                              }
                              placeholder="I"
                              className={codeInputCls}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              type="date"
                              value={row.lastCuttingOil}
                              onChange={(e) =>
                                updateRow(row.id, { lastCuttingOil: e.target.value })
                              }
                              className={dateInputCls}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              type="date"
                              value={row.nextCuttingOil}
                              onChange={(e) =>
                                updateRow(row.id, { nextCuttingOil: e.target.value })
                              }
                              className={dateInputCls}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              type="date"
                              value={row.lastHydraulicOil}
                              onChange={(e) =>
                                updateRow(row.id, { lastHydraulicOil: e.target.value })
                              }
                              className={dateInputCls}
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-0.5 py-1">
                            <input
                              value={row.lastHydraulicCode}
                              onChange={(e) =>
                                updateRow(row.id, { lastHydraulicCode: e.target.value })
                              }
                              placeholder="W"
                              className={codeInputCls}
                              title="W / IB / K"
                            />
                          </td>
                          <td className="border-kwd-surface-light border px-1 py-1">
                            <input
                              type="date"
                              value={row.nextHydraulicOil}
                              onChange={(e) =>
                                updateRow(row.id, { nextHydraulicOil: e.target.value })
                              }
                              className={dateInputCls}
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
                        <td colSpan={15} className="border-kwd-surface-light border px-3 py-2">
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
                Die Maschinen erscheinen in der Liste – gleichnamige wurden aktualisiert, ohne
                Lebenszyklus zu löschen.
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
                ? 'Importiere…'
                : `${selectedCount} Maschine${selectedCount === 1 ? '' : 'n'} übernehmen`}
            </button>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className="kwd-btn kwd-btn-primary min-h-[44px]">
              Fertig
            </button>
          )}
          {step !== 'done' && (
            <button type="button" onClick={onClose} className="kwd-btn min-h-[44px]">
              Abbrechen
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
  text,
  highlight,
}: {
  label: string
  value: string | number
  text?: boolean
  highlight?: 'success'
}) {
  return (
    <div className="bg-kwd-bg rounded-lg px-3 py-2">
      <p className="text-kwd-muted text-[10px] font-bold uppercase tracking-wide">{label}</p>
      <p
        className={`truncate font-bold ${text ? 'text-sm' : 'text-lg'} ${
          highlight === 'success' ? 'text-kwd-success' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}
