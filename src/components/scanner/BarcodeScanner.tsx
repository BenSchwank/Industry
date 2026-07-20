import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface BarcodeScannerProps {
  onScan: (code: string) => void
  onClose: () => void
}

/**
 * Kamera-Scanner mit sauberem Start/Stop (Strict Mode),
 * sichtbaren Fehlern und Datei-Fallback wenn keine Kamera.
 */
export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const reactId = useId().replace(/:/g, '')
  const elementId = `kwd-scan-${reactId}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)
  const runningRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  const handleScan = useCallback(
    (code: string) => {
      const trimmed = code.trim()
      if (!trimmed || handledRef.current) return
      handledRef.current = true
      onScan(trimmed)
    },
    [onScan],
  )

  useEffect(() => {
    let cancelled = false
    handledRef.current = false
    setError(null)
    setStarting(true)

    const el = document.getElementById(elementId)
    if (!el) {
      setError('Scanner-Element fehlt.')
      setStarting(false)
      return
    }

    // Alte Video-Nodes von Strict-Mode-Remounts entfernen
    el.innerHTML = ''

    const scanner = new Html5Qrcode(elementId, { verbose: false })
    scannerRef.current = scanner

    async function startCamera() {
      const configs = [
        { facingMode: 'environment' as const },
        { facingMode: 'user' as const },
      ]

      let lastErr: unknown = null
      for (const cameraConfig of configs) {
        if (cancelled) return
        try {
          await scanner.start(
            cameraConfig,
            {
              fps: 8,
              qrbox: (w, h) => {
                const size = Math.max(120, Math.floor(Math.min(w, h) * 0.65))
                return { width: size, height: size }
              },
            },
            (decoded) => handleScan(decoded),
            () => {},
          )
          if (cancelled) {
            await safeStop(scanner)
            return
          }
          runningRef.current = true
          setStarting(false)
          return
        } catch (err) {
          lastErr = err
          await safeStop(scanner)
        }
      }

      // Keine Kamera → Geräte auflisten
      if (!cancelled) {
        try {
          const cameras = await Html5Qrcode.getCameras()
          if (cameras.length > 0 && !cancelled) {
            await scanner.start(
              cameras[0].id,
              {
                fps: 8,
                qrbox: (w, h) => {
                  const size = Math.max(120, Math.floor(Math.min(w, h) * 0.65))
                  return { width: size, height: size }
                },
              },
              (decoded) => handleScan(decoded),
              () => {},
            )
            if (cancelled) {
              await safeStop(scanner)
              return
            }
            runningRef.current = true
            setStarting(false)
            return
          }
        } catch (err) {
          lastErr = err
        }
      }

      if (!cancelled) {
        setStarting(false)
        const msg =
          lastErr instanceof Error
            ? lastErr.message
            : typeof lastErr === 'string'
              ? lastErr
              : 'Kamera nicht verfügbar'
        setError(
          /permission|NotAllowed|denied/i.test(msg)
            ? 'Kamera-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben oder Bilddatei wählen.'
            : /NotFound|DevicesNotFound|Requested device not found/i.test(msg)
              ? 'Keine Kamera gefunden. Am Desktop: Bild vom Code hochladen oder Code manuell eingeben.'
              : `Kamera konnte nicht gestartet werden: ${msg}`,
        )
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      runningRef.current = false
      const s = scannerRef.current
      scannerRef.current = null
      if (s) void safeStop(s)
    }
  }, [elementId, handleScan])

  async function scanFile(file: File | null) {
    if (!file) return
    setError(null)
    try {
      // Temporäre Instanz, falls Kamera-Scanner nicht läuft
      let scanner = scannerRef.current
      if (!scanner) {
        scanner = new Html5Qrcode(elementId, { verbose: false })
        scannerRef.current = scanner
      }
      if (runningRef.current) {
        await safeStop(scanner)
        runningRef.current = false
      }
      const code = await scanner.scanFile(file, true)
      handleScan(code)
    } catch (err) {
      setError(
        err instanceof Error
          ? `Kein Code im Bild erkannt (${err.message})`
          : 'Kein Code im Bild erkannt.',
      )
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4">
      <div className="kwd-toolbar">
        <h2 className="mr-auto text-base font-bold">Barcode scannen</h2>
        <button type="button" onClick={onClose} className="kwd-btn">
          Abbrechen
        </button>
      </div>

      {starting && !error && (
        <p className="text-kwd-muted text-sm">Kamera wird gestartet…</p>
      )}

      {error && (
        <div className="bg-kwd-danger/10 text-kwd-danger border-kwd-danger border px-3 py-3 text-sm">
          <p className="font-semibold">{error}</p>
          <p className="mt-2 text-kwd-text text-xs font-normal">
            Alternative: Foto/Screenshot eines QR- oder Barcodes wählen, oder zurück und Code tippen.
          </p>
        </div>
      )}

      <div
        id={elementId}
        className="border-kwd-border bg-kwd-surface min-h-[280px] overflow-hidden border"
      />

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void scanFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="kwd-btn kwd-btn-primary"
          onClick={() => fileRef.current?.click()}
        >
          Bilddatei scannen
        </button>
        <button type="button" className="kwd-btn" onClick={onClose}>
          Manuell eingeben
        </button>
      </div>

      <p className="text-kwd-muted text-center text-xs">
        Code in den Rahmen halten – Maschine oder Lagerartikel wird erkannt.
      </p>
    </div>
  )
}

async function safeStop(scanner: Html5Qrcode) {
  try {
    const state = scanner.getState?.()
    // 2 = SCANNING, 3 = PAUSED (html5-qrcode Html5QrcodeScannerState)
    if (state === 2 || state === 3) {
      await scanner.stop()
    }
  } catch {
    /* bereits gestoppt */
  }
  try {
    scanner.clear()
  } catch {
    /* ignore */
  }
}
