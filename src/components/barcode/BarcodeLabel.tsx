import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { normalizeBarcode } from '../../lib/barcode'
import { printMachineLabels } from '../../lib/printLabels'

interface BarcodeLabelProps {
  code: string
  title: string
  subtitle?: string
}

export function BarcodeLabel({ code, title, subtitle }: BarcodeLabelProps) {
  const normalized = normalizeBarcode(code)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!canvasRef.current || !normalized) return

    QRCode.toCanvas(canvasRef.current, normalized, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).catch(() => setError('QR-Code konnte nicht erzeugt werden.'))
  }, [normalized])

  async function handlePrint() {
    if (!normalized) return
    setPrinting(true)
    setError(null)
    try {
      await printMachineLabels([{ code: normalized, title, subtitle }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Druck fehlgeschlagen')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDownload() {
    if (!canvasRef.current || !normalized) return
    const url = canvasRef.current.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `${normalized}.png`
    link.href = url
    link.click()
  }

  return (
    <section className="kwd-panel">
      <div className="kwd-panel-head">Scan-Label</div>
      <div className="p-3">
        <p className="text-kwd-muted text-xs">
          QR-Code ausdrucken und an der Maschine anbringen.
        </p>

        <div className="mt-3 flex flex-col items-center">
          {error ? (
            <p className="text-kwd-danger text-sm">{error}</p>
          ) : (
            <canvas ref={canvasRef} className="bg-white p-2" aria-label={`QR ${normalized}`} />
          )}
          <h3 className="mt-3 text-base font-bold">{title}</h3>
          {subtitle && <p className="text-kwd-muted text-sm">{subtitle}</p>}
          <p className="mt-2 font-mono text-lg font-bold tracking-wider">{normalized}</p>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={printing || !normalized}
            className="kwd-btn kwd-btn-primary flex-1"
          >
            {printing ? 'Öffne…' : 'Label drucken'}
          </button>
          <button type="button" onClick={() => void handleDownload()} className="kwd-btn flex-1">
            PNG speichern
          </button>
        </div>
      </div>
    </section>
  )
}
