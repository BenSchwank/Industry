import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { importQS1Rows } from '../../lib/import/qs1Importer'
import { parseQS1Csv, type QS1ImportRow } from '../../lib/import/qs1Parser'
import { buildQS1Preview, type QS1PreviewSummary } from '../../lib/import/qs1Preview'
import { loadSavedTemplate } from '../../lib/import/qs1Template'
import { QS1TemplateEditor } from './QS1TemplateEditor'

type Step = 'pick' | 'preview' | 'done'

interface QS1ImportModalProps {
  onClose: () => void
}

export function QS1ImportModal({ onClose }: QS1ImportModalProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('pick')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [sourceLabel, setSourceLabel] = useState('')
  const [importSource, setImportSource] = useState<'file' | 'template'>('file')
  const [rows, setRows] = useState<QS1ImportRow[]>([])
  const [preview, setPreview] = useState<QS1PreviewSummary | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)

  async function showPreview(
    parsedRows: QS1ImportRow[],
    hdrs: string[],
    errors: string[],
    source: string,
    sourceType: 'file' | 'template',
  ) {
    setParseErrors(errors)
    setHeaders(hdrs)
    setSourceLabel(source)
    setImportSource(sourceType)
    setRows(parsedRows)

    if (parsedRows.length === 0) {
      setParseErrors(errors.length ? errors : ['Keine gültigen Zeilen gefunden.'])
      setStep('pick')
      return
    }

    setLoading(true)
    try {
      const summary = await buildQS1Preview(parsedRows)
      setPreview(summary)
      setStep('preview')
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : 'Vorschau fehlgeschlagen'])
    } finally {
      setLoading(false)
    }
  }

  async function handleFile(file: File) {
    const text = await file.text()
    setFileContent(text)
    const parsed = parseQS1Csv(text)
    await showPreview(parsed.rows, parsed.headers, parsed.errors, file.name, 'file')
  }

  async function handleImport() {
    setImporting(true)
    let parsedRows = rows

    if (importSource === 'file' && fileContent) {
      parsedRows = parseQS1Csv(fileContent).rows
    } else if (importSource === 'template') {
      parsedRows = parseQS1Csv(loadSavedTemplate()).rows
    }

    const stats = await importQS1Rows(
      parsedRows,
      importSource === 'file' ? sourceLabel : 'vorlage-editor.csv',
    )
    setImporting(false)

    setResult(
      `Import fertig: ${stats.machinesCreated} Maschinen neu, ${stats.machinesUpdated} aktualisiert, ` +
        `${stats.tasksCreated} Wartungspläne neu, ${stats.tasksUpdated} aktualisiert, ` +
        `${stats.checklistItems} Checklisten-Punkte.` +
        (stats.errors.length ? ` ${stats.errors.length} Fehler.` : ''),
    )
    setStep('done')

    await queryClient.invalidateQueries({ queryKey: ['machines'] })
    await queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
    await queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
    await queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 lg:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qs1-import-title"
    >
      <div className="bg-kwd-surface border-kwd-surface-light flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
        <header className="border-kwd-surface-light flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 lg:px-6">
          <div>
            <p className="text-kwd-primary text-xs font-bold uppercase tracking-widest">QS1 Import</p>
            <h2 id="qs1-import-title" className="text-xl font-bold lg:text-2xl">
              {step === 'preview' ? 'Import-Vorschau' : step === 'done' ? 'Import abgeschlossen' : 'Daten auswählen'}
            </h2>
            {sourceLabel && step !== 'pick' && (
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
          {step === 'pick' && (
            <div className="flex flex-col gap-6">
              <section className="bg-kwd-bg rounded-xl p-5">
                <h3 className="font-bold">QS1-Export-Datei (CSV)</h3>
                <p className="text-kwd-muted mt-1 text-sm">
                  Datei wählen – danach erscheint die Vorschau aller Maschinen & Wartungspläne.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="mt-4 w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
              </section>

              <QS1TemplateEditor
                onPreview={(r, h, e, source) => showPreview(r, h, e, source, 'template')}
              />
            </div>
          )}

          {loading && <p className="text-kwd-muted py-8 text-center">Vorschau wird erstellt…</p>}

          {parseErrors.length > 0 && step === 'pick' && (
            <div className="border-kwd-warning bg-kwd-warning/10 mt-4 rounded-xl border p-4">
              {parseErrors.map((e) => (
                <p key={e} className="text-sm">
                  ⚠ {e}
                </p>
              ))}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <SummaryCard label="Zeilen" value={preview.totalRows} />
                <SummaryCard label="Maschinen neu" value={preview.newMachines} highlight="success" />
                <SummaryCard label="Maschinen Update" value={preview.updatedMachines} />
                <SummaryCard label="Wartungen neu" value={preview.newTasks} highlight="success" />
                <SummaryCard label="Checkpunkte" value={preview.totalChecklistItems} />
              </div>

              {headers.length > 0 && (
                <p className="text-kwd-muted text-xs">Erkannte Spalten: {headers.join(' · ')}</p>
              )}

              <div className="border-kwd-surface-light overflow-hidden rounded-xl border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-kwd-surface-light text-kwd-muted text-left text-xs font-bold uppercase">
                        <th className="border-kwd-surface-light border px-3 py-2">Aktion</th>
                        <th className="border-kwd-surface-light border px-3 py-2">QS1-ID</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Maschine</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Standort</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Scan-Code</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Wartung</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Intervall</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Fällig</th>
                        <th className="border-kwd-surface-light border px-3 py-2">Checkliste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.machines.flatMap((machine) =>
                        machine.tasks.map((task, idx) => (
                          <tr
                            key={`${machine.externalId}-${task.title}-${idx}`}
                            className={idx % 2 === 0 ? 'bg-kwd-bg/50' : ''}
                          >
                            <td className="border-kwd-surface-light border px-3 py-2">
                              <ActionBadge action={idx === 0 ? machine.action : task.action} />
                            </td>
                            <td className="border-kwd-surface-light border px-3 py-2 font-mono text-xs">
                              {idx === 0 ? machine.externalId : ''}
                            </td>
                            <td className="border-kwd-surface-light border px-3 py-2 font-medium">
                              {idx === 0 ? machine.name : ''}
                            </td>
                            <td className="border-kwd-surface-light text-kwd-muted border px-3 py-2">
                              {idx === 0 ? (machine.location ?? '–') : ''}
                            </td>
                            <td className="border-kwd-surface-light border px-3 py-2 font-mono text-xs">
                              {idx === 0 ? machine.barcode : ''}
                            </td>
                            <td className="border-kwd-surface-light border px-3 py-2">{task.title}</td>
                            <td className="border-kwd-surface-light border px-3 py-2">
                              {task.frequencyDays} T
                            </td>
                            <td className="border-kwd-surface-light border px-3 py-2">
                              {task.nextDueDate}
                            </td>
                            <td className="border-kwd-surface-light text-kwd-muted border px-3 py-2 text-xs">
                              {task.checklistItems.join(' · ') || '–'}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-kwd-muted text-sm">
                Bitte Vorschau prüfen. Erst nach Bestätigung werden Daten in die Datenbank geschrieben.
              </p>
            </div>
          )}

          {step === 'done' && result && (
            <p className="bg-kwd-success/20 text-kwd-success rounded-xl p-5 text-sm font-medium">
              {result}
            </p>
          )}
        </div>

        <footer className="border-kwd-surface-light flex shrink-0 flex-wrap gap-3 border-t px-5 py-4 lg:px-6">
          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('pick')
                  setPreview(null)
                }}
                className="bg-kwd-surface-light min-h-[48px] rounded-xl px-5 font-semibold"
              >
                ← Zurück
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={handleImport}
                className="bg-kwd-primary text-kwd-bg min-h-[48px] flex-1 rounded-xl px-6 font-bold disabled:opacity-50 lg:flex-none"
              >
                {importing ? 'Importiere…' : `${preview?.totalRows ?? 0} Zeilen importieren`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              type="button"
              onClick={onClose}
              className="bg-kwd-primary text-kwd-bg min-h-[48px] rounded-xl px-8 font-bold"
            >
              Fertig
            </button>
          )}
          {step === 'pick' && (
            <button
              type="button"
              onClick={onClose}
              className="bg-kwd-surface-light min-h-[48px] rounded-xl px-5 font-semibold"
            >
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
  highlight,
}: {
  label: string
  value: number
  highlight?: 'success'
}) {
  return (
    <div className="bg-kwd-bg rounded-xl p-3">
      <p className="text-kwd-muted text-xs font-bold uppercase">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${highlight === 'success' ? 'text-kwd-success' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

function ActionBadge({ action }: { action: 'create' | 'update' }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-bold ${
        action === 'create' ? 'bg-kwd-success/20 text-kwd-success' : 'bg-kwd-warning/20 text-kwd-warning'
      }`}
    >
      {action === 'create' ? 'Neu' : 'Update'}
    </span>
  )
}
