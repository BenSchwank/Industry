import { useState } from 'react'
import { QS1ImportModal } from '../components/import/QS1ImportModal'

export default function ImportPage() {
  const [open, setOpen] = useState(true)

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8">
      <header>
        <p className="text-kwd-primary text-xs font-bold uppercase tracking-widest">Desktop</p>
        <h2 className="text-2xl font-bold">QS1 Import</h2>
        <p className="text-kwd-muted mt-2 max-w-2xl text-sm">
          Wartungspläne aus QS1 (QSC) importieren – mit Vorschau vor dem Speichern.
        </p>
      </header>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-kwd-primary text-kwd-bg self-start rounded-xl px-8 py-3 font-bold"
      >
        QS1 Import öffnen
      </button>

      {open && <QS1ImportModal onClose={() => setOpen(false)} />}
    </div>
  )
}
