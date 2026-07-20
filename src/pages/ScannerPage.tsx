import { lazy, Suspense, useCallback, useState } from 'react'
import { lookupBarcode } from '../hooks/useBarcodeLookup'
import { useIsMobile } from '../hooks/usePlatform'
import { useAppStore } from '../stores/appStore'
import { LoadingFallback } from '../components/ui/LoadingFallback'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { Tip } from '../components/ui/Tip'

const BarcodeScanner = lazy(() =>
  import('../components/scanner/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
)

export default function ScannerPage() {
  const [scannerActive, setScannerActive] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'error' | 'ok'; message?: string }>(
    { type: 'idle' },
  )

  const setActiveView = useAppStore((s) => s.setActiveView)
  const setSelectedMachineId = useAppStore((s) => s.setSelectedMachineId)
  const setSelectedInventoryItemId = useAppStore((s) => s.setSelectedInventoryItemId)
  const setMachineDetailFocus = useAppStore((s) => s.setMachineDetailFocus)
  const isMobile = useIsMobile()

  const routeBarcode = useCallback(
    async (code: string) => {
      setScannerActive(false)
      setStatus({ type: 'loading', message: 'Suche Code…' })

      try {
        const result = await lookupBarcode(code)

        if (result.type === 'machine') {
          setSelectedMachineId(result.id)
          setMachineDetailFocus(true)
          setActiveView('machines')
          setStatus({ type: 'idle' })
          return
        }
        if (result.type === 'inventory') {
          setSelectedInventoryItemId(result.id)
          setActiveView('inventory')
          setStatus({ type: 'idle' })
          return
        }
        setStatus({
          type: 'error',
          message: `Unbekannter Code: ${result.barcode || code}. Prüfen oder Maschine zuerst anlegen.`,
        })
      } catch (err) {
        setStatus({
          type: 'error',
          message:
            err instanceof Error
              ? `Suche fehlgeschlagen: ${err.message}`
              : 'Verbindungsfehler – bitte erneut versuchen.',
        })
      }
    },
    [setActiveView, setSelectedMachineId, setSelectedInventoryItemId, setMachineDetailFocus],
  )

  if (scannerActive) {
    return (
      <ErrorBoundary resetKey="scanner-cam">
        <Suspense fallback={<LoadingFallback label="Kamera wird geladen…" />}>
          <BarcodeScanner onScan={routeBarcode} onClose={() => setScannerActive(false)} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-3 lg:p-4">
      <section className="kwd-panel flex flex-1 flex-col items-center justify-center gap-5 p-6">
        <div className="text-center">
          <p className="text-kwd-muted text-xs font-semibold tracking-wide uppercase">
            Scanner-Zentrale
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">Code scannen oder eingeben</h2>
        </div>

        <button
          type="button"
          onClick={() => {
            setStatus({ type: 'idle' })
            setScannerActive(true)
          }}
          className="kwd-btn kwd-btn-primary min-h-[88px] w-full max-w-sm text-lg"
        >
          Kamera / Bild scannen
        </button>

        <div className="w-full max-w-sm">
          <label htmlFor="manual-barcode" className="kwd-kpi-label mb-1 block">
            Oder Code manuell eingeben
          </label>
          <div className="flex gap-2">
            <input
              id="manual-barcode"
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="z.B. MCH-001 oder LAG-001"
              className="border-kwd-border bg-kwd-paper text-kwd-text min-h-[48px] flex-1 border px-3 text-base"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualCode.trim()) void routeBarcode(manualCode)
              }}
            />
            <button
              type="button"
              disabled={!manualCode.trim() || status.type === 'loading'}
              onClick={() => void routeBarcode(manualCode)}
              className="kwd-btn kwd-btn-primary min-h-[48px]"
            >
              OK
            </button>
          </div>
        </div>

        {status.type === 'loading' && (
          <p className="text-kwd-primary text-sm font-medium">{status.message}</p>
        )}
        {status.type === 'error' && (
          <p className="bg-kwd-danger/10 text-kwd-danger border-kwd-danger max-w-sm border px-3 py-2 text-sm font-medium">
            {status.message}
          </p>
        )}
      </section>

      {isMobile && (
        <section className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveView('tickets')}
            className="kwd-btn kwd-btn-danger min-h-[56px]"
          >
            Störung melden
          </button>
          <button
            type="button"
            onClick={() => setActiveView('maintenance')}
            className="kwd-btn min-h-[56px]"
          >
            Wartung starten
          </button>
        </section>
      )}

      <Tip>
        <section className="kwd-panel p-3">
          <p className="kwd-kpi-label">Routing</p>
          <ul className="text-kwd-muted mt-2 space-y-1 text-sm">
            <li>• Maschinen-Codes → Maschinenakte</li>
            <li>• Lager-Codes → Lagerverwaltung</li>
            <li>• Ohne Kamera: „Bilddatei scannen“ oder manuell tippen</li>
          </ul>
        </section>
      </Tip>
    </div>
  )
}
