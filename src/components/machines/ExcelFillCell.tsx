import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

interface ExcelFillCellProps {
  selected: boolean
  onSelect: () => void
  /** Beim Loslassen nach dem Ziehen: Anzahl Zeilen nach unten */
  onFillDown: (rowCount: number) => void
  children: ReactNode
  className?: string
}

const ROW_HEIGHT = 36

/** Excel-Zelle mit schwarzem Ausfüllkästchen (unten rechts) */
export function ExcelFillCell({
  selected,
  onSelect,
  onFillDown,
  children,
  className = '',
}: ExcelFillCellProps) {
  const [previewRows, setPreviewRows] = useState(0)
  const dragging = useRef(false)
  const startY = useRef(0)

  const endDrag = useCallback(
    (clientY: number) => {
      if (!dragging.current) return
      dragging.current = false
      const delta = clientY - startY.current
      const rows = Math.max(0, Math.round(delta / ROW_HEIGHT))
      setPreviewRows(0)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (rows > 0) onFillDown(rows)
    },
    [onFillDown],
  )

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const delta = e.clientY - startY.current
      setPreviewRows(Math.max(0, Math.round(delta / ROW_HEIGHT)))
    }
    function onUp(e: MouseEvent) {
      endDrag(e.clientY)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [endDrag])

  function startFill(e: ReactMouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    dragging.current = true
    startY.current = e.clientY
    document.body.style.cursor = 'crosshair'
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      className={`relative min-h-[32px] ${selected ? 'ring-2 ring-[var(--kwd-primary)] ring-inset' : ''} ${className}`}
      onMouseDown={(e) => {
        // Klick in Zelle = auswählen (nicht am Handle)
        if ((e.target as HTMLElement).dataset.fillHandle) return
        onSelect()
      }}
    >
      {children}
      {selected && (
        <button
          type="button"
          data-fill-handle="true"
          aria-label="Ausfüllkästchen: nach unten ziehen"
          title="Nach unten ziehen (wie Excel)"
          onMouseDown={startFill}
          className="absolute -right-1 -bottom-1 z-20 h-2.5 w-2.5 cursor-crosshair border border-white bg-black shadow-sm"
          style={{ touchAction: 'none' }}
        />
      )}
      {previewRows > 0 && (
        <div className="pointer-events-none absolute top-full left-0 z-30 mt-0.5 whitespace-nowrap bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">
          +{previewRows} Zeilen
        </div>
      )}
    </div>
  )
}
