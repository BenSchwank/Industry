import { useEffect, useState } from 'react'
import { parseQS1Csv } from '../../lib/import/qs1Parser'
import type { QS1ImportRow } from '../../lib/import/qs1Parser'
import {
  QS1_COLUMN_HELP,
  QS1_TEMPLATE_DEFAULT,
  downloadTemplate,
  loadSavedTemplate,
  saveTemplate,
} from '../../lib/import/qs1Template'

interface QS1TemplateEditorProps {
  onPreview: (rows: QS1ImportRow[], headers: string[], errors: string[], sourceLabel: string) => void
}

export function QS1TemplateEditor({ onPreview }: QS1TemplateEditorProps) {
  const [content, setContent] = useState(loadSavedTemplate)
  const [savedHint, setSavedHint] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => saveTemplate(content), 500)
    return () => clearTimeout(t)
  }, [content])

  function runPreview() {
    const parsed = parseQS1Csv(content)
    onPreview(parsed.rows, parsed.headers, parsed.errors, 'Vorlage (Editor)')
    setSavedHint(true)
    window.setTimeout(() => setSavedHint(false), 2000)
  }

  function resetTemplate() {
    setContent(QS1_TEMPLATE_DEFAULT)
  }

  const lineCount = content.split('\n').length
  const dataLines = content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length - 1

  return (
    <section className="bg-kwd-surface rounded-xl p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">Import-Vorlage bearbeiten</h3>
          <p className="text-kwd-muted mt-1 max-w-xl text-sm">
            Passe das Format hier an deinen QS1-Export an. Kommentarzeilen (#) und Spaltennamen
            sind frei wählbar – der Import erkennt gängige deutsche Bezeichnungen automatisch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreview}
            className="bg-kwd-primary text-kwd-bg rounded-lg px-4 py-2 text-sm font-bold"
          >
            Vorschau testen
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate(content)}
            className="bg-kwd-surface-light rounded-lg px-4 py-2 text-sm font-semibold"
          >
            CSV speichern
          </button>
          <button
            type="button"
            onClick={resetTemplate}
            className="text-kwd-muted rounded-lg px-3 py-2 text-sm underline"
          >
            Zurücksetzen
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-kwd-muted text-xs">
              {lineCount} Zeilen · {Math.max(0, dataLines)} Datensätze
              {savedHint && <span className="text-kwd-success ml-2">· Gespeichert</span>}
            </span>
            <span className="text-kwd-muted text-xs">Trennzeichen: Semikolon (;)</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="bg-kwd-bg border-kwd-surface-light h-64 w-full resize-y rounded-lg border p-3 font-mono text-xs leading-relaxed lg:h-80"
            aria-label="QS1 CSV Vorlage"
          />
        </div>

        <div className="bg-kwd-bg rounded-lg p-3">
          <p className="text-kwd-muted mb-2 text-xs font-bold uppercase">Spalten-Referenz</p>
          <ul className="space-y-2 text-xs">
            {QS1_COLUMN_HELP.map((col) => (
              <li key={col.name}>
                <span className="font-semibold text-kwd-text">
                  {col.name}
                  {col.required && <span className="text-kwd-danger"> *</span>}
                </span>
                <p className="text-kwd-muted">{col.aliases}</p>
              </li>
            ))}
          </ul>
          <p className="text-kwd-muted mt-3 text-[10px]">
            * Pflichtfeld · Datum: 01.08.2026 oder 2026-08-01 · Checkliste: Punkt A|Punkt B
          </p>
        </div>
      </div>
    </section>
  )
}
