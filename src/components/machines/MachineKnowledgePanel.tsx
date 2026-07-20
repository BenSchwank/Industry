import { lazy, Suspense, useEffect, useState } from 'react'
import { LoadingFallback } from '../ui/LoadingFallback'

const BarcodeLabel = lazy(() =>
  import('../barcode/BarcodeLabel').then((m) => ({ default: m.BarcodeLabel })),
)

function notesKey(machineId: string) {
  return `kwd-machine-knowledge-${machineId}`
}

interface MachineKnowledgePanelProps {
  machineId: string
  machineName: string
  barcode: string
  location?: string | null
}

/** Maschinenwissen + druckbares Scan-Label */
export function MachineKnowledgePanel({
  machineId,
  machineName,
  barcode,
  location,
}: MachineKnowledgePanelProps) {
  const [notes, setNotes] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    try {
      setNotes(localStorage.getItem(notesKey(machineId)) ?? '')
    } catch {
      setNotes('')
    }
    setSavedAt(null)
  }, [machineId])

  function saveNotes() {
    try {
      localStorage.setItem(notesKey(machineId), notes)
      setSavedAt(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-start">
      <section className="kwd-panel">
        <div className="kwd-panel-head">Maschinenwissen</div>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-kwd-muted text-xs">
            Hinweise für die Halle: Besonderheiten, Ersatzteile, Ansprechpartner – lokal auf
            diesem Gerät gespeichert.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={10}
            placeholder="z.B. Öltyp, kritische Parameter, bekannte Fehler…"
            className="border-kwd-border bg-kwd-paper text-kwd-text min-h-[160px] w-full resize-y border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={saveNotes} className="kwd-btn kwd-btn-primary">
              Wissen speichern
            </button>
            {savedAt && <span className="text-kwd-success text-xs">Gespeichert {savedAt}</span>}
          </div>
        </div>
      </section>

      <Suspense fallback={<LoadingFallback label="Label wird erzeugt…" />}>
        <BarcodeLabel
          code={barcode}
          title={machineName}
          subtitle={location ?? undefined}
        />
      </Suspense>
    </div>
  )
}
