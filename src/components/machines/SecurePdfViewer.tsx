import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { formatSupabaseError } from '../../lib/formatError'
import { supabase } from '../../lib/supabase'

const BUCKET = 'machine-documents'

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href
  return pdfjs
}

/** PDF-Bytes nur über Storage-Download (kein Signed-URL im DOM). */
export function useAttachmentPdfBytes(storagePath: string | null) {
  return useQuery({
    queryKey: ['attachment-pdf-bytes', storagePath],
    enabled: Boolean(storagePath),
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(storagePath!)
      if (error) throw new Error(formatSupabaseError(error))
      return await data.arrayBuffer()
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
  })
}

interface SecurePdfViewerProps {
  storagePath: string
  filename: string
  className?: string
}

/**
 * Ansicht nur in der App: Seiten als Canvas (kein Browser-PDF-Chrome,
 * kein Download-Link, kein „Neuer Tab“). Absoluter Schutz ist im Browser
 * nicht möglich – Ziel ist, Speichern/Stehlen deutlich zu erschweren.
 */
export function SecurePdfViewer({ storagePath, filename, className = '' }: SecurePdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [scale, setScale] = useState(1.15)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const docRef = useRef<PDFDocumentProxy | null>(null)

  const { data: bytes, isLoading, error } = useAttachmentPdfBytes(storagePath)

  useEffect(() => {
    setPage(1)
    setPageCount(0)
    setRenderError(null)
    docRef.current = null
  }, [storagePath])

  useEffect(() => {
    if (!bytes) return
    let cancelled = false

    void (async () => {
      try {
        const pdfjs = await loadPdfJs()
        // Kopie: pdf.js übernimmt/transferiert den Buffer
        const data = bytes.slice(0)
        const doc = await pdfjs.getDocument({ data }).promise
        if (cancelled) {
          void doc.cleanup()
          return
        }
        docRef.current = doc
        setPageCount(doc.numPages)
        setPage(1)
      } catch (e) {
        if (!cancelled) {
          setRenderError(e instanceof Error ? e.message : 'PDF konnte nicht geladen werden')
        }
      }
    })()

    return () => {
      cancelled = true
      void docRef.current?.cleanup()
      docRef.current = null
    }
  }, [bytes])

  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || pageCount === 0) return
    let cancelled = false

    void (async () => {
      setRendering(true)
      setRenderError(null)
      try {
        const pdfPage = await doc.getPage(page)
        if (cancelled) return
        const viewport = pdfPage.getViewport({ scale })
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas nicht verfügbar')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise
      } catch (e) {
        if (!cancelled) {
          setRenderError(e instanceof Error ? e.message : 'Seite konnte nicht gerendert werden')
        }
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, scale, pageCount, bytes])

  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault()
      setPage((p) => Math.min(pageCount, p + 1))
    }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault()
      setPage((p) => Math.max(1, p - 1))
    }
  }

  if (isLoading) {
    return (
      <p className={`text-kwd-muted p-8 text-center text-sm ${className}`}>
        Dokument wird geladen…
      </p>
    )
  }

  if (error) {
    return (
      <p className={`text-kwd-danger p-8 text-center text-sm ${className}`}>
        {error instanceof Error ? error.message : 'Laden fehlgeschlagen'}
      </p>
    )
  }

  return (
    <div
      className={`flex flex-col ${className}`}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="document"
      aria-label={`Geschützte Ansicht: ${filename}`}
    >
      <div className="border-kwd-border bg-kwd-surface flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
        <button
          type="button"
          className="kwd-btn px-2 text-xs"
          disabled={page <= 1 || rendering}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ←
        </button>
        <span className="text-kwd-muted min-w-[5.5rem] text-center text-xs font-semibold tabular-nums">
          {pageCount > 0 ? `${page} / ${pageCount}` : '–'}
        </span>
        <button
          type="button"
          className="kwd-btn px-2 text-xs"
          disabled={page >= pageCount || rendering}
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
        >
          →
        </button>
        <span className="bg-kwd-border mx-1 hidden h-4 w-px sm:inline" aria-hidden />
        <button
          type="button"
          className="kwd-btn px-2 text-xs"
          disabled={scale <= 0.7}
          onClick={() => setScale((s) => Math.max(0.7, Math.round((s - 0.15) * 100) / 100))}
        >
          −
        </button>
        <span className="text-kwd-muted w-10 text-center text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="kwd-btn px-2 text-xs"
          disabled={scale >= 2.2}
          onClick={() => setScale((s) => Math.min(2.2, Math.round((s + 0.15) * 100) / 100))}
        >
          +
        </button>
        <p className="text-kwd-muted ml-auto text-[10px] font-medium tracking-wide uppercase">
          Nur Ansicht · kein Download
        </p>
      </div>

      <div className="bg-kwd-bg relative max-h-[min(56vh,560px)] overflow-auto">
        {renderError && (
          <p className="text-kwd-danger p-6 text-center text-sm">{renderError}</p>
        )}
        <div className="flex justify-center p-3 select-none">
          <div className="relative inline-block shadow-md">
            <canvas
              ref={canvasRef}
              className="bg-white max-w-full"
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                pointerEvents: 'none',
              }}
            />
            {/* Leichte Markierung erschwert schnelles Screenshot-Recycling */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              aria-hidden
              style={{
                backgroundImage:
                  'repeating-linear-gradient(-35deg, transparent, transparent 48px, currentColor 48px, currentColor 49px)',
              }}
            />
          </div>
        </div>
        {rendering && (
          <p className="text-kwd-muted absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[10px] text-white">
            Rendert…
          </p>
        )}
      </div>
    </div>
  )
}
