import { useEffect, useRef, useState } from 'react'
import {
  MACHINE_CATEGORY_DATALIST_ID,
  UNCATEGORIZED_LABEL,
} from '../../lib/machineCategories'

interface CategoryPickerProps {
  value: string
  suggestions: string[]
  /** Kurz-Label auf dem Button */
  buttonLabel?: string
  title?: string
  disabled?: boolean
  className?: string
  onChange: (category: string) => void
  /** Zusätzlich neuen Wert dauerhaft merken (Parent speichert oft schon) */
  onCommitNew?: (category: string) => void
}

/** Button öffnet Popover: bestehende Kategorie wählen oder neue eintippen */
export function CategoryPickerButton({
  value,
  suggestions,
  buttonLabel,
  title = 'Kategorie wählen oder neu anlegen',
  disabled,
  className = '',
  onChange,
  onCommitNew,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setDraft(value)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, value])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function apply(next: string) {
    const trimmed = next.trim()
    onChange(trimmed)
    if (trimmed) onCommitNew?.(trimmed)
    setOpen(false)
  }

  const label = buttonLabel ?? (value.trim() || 'Kategorie')

  return (
    <div className={`relative inline-flex ${className}`} ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`kwd-btn max-w-[9rem] truncate px-2 text-xs ${
          value.trim() ? 'kwd-btn-primary' : ''
        }`}
        title={title}
      >
        {label}
      </button>
      {open && (
        <div
          className="border-kwd-border bg-kwd-surface absolute top-full left-0 z-40 mt-1 w-[16rem] border p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-kwd-muted mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
            Kategorie / Ordner
          </p>
          <input
            ref={inputRef}
            list={MACHINE_CATEGORY_DATALIST_ID}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply(draft)
              }
            }}
            placeholder="neu eintippen…"
            className="border-kwd-border bg-kwd-paper mb-2 h-8 w-full border px-2 text-sm"
          />
          <div className="mb-2 flex max-h-40 flex-col gap-0.5 overflow-auto">
            <button
              type="button"
              onClick={() => apply('')}
              className="hover:bg-kwd-surface-light px-2 py-1 text-left text-xs"
            >
              {UNCATEGORIZED_LABEL}
            </button>
            {suggestions.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => apply(c)}
                className={`hover:bg-kwd-surface-light px-2 py-1 text-left text-xs ${
                  c === value.trim() ? 'bg-kwd-primary/15 font-semibold' : ''
                }`}
              >
                {c}
              </button>
            ))}
            {suggestions.length === 0 && (
              <p className="text-kwd-muted px-2 py-1 text-[11px]">Noch keine Kategorien</p>
            )}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => apply(draft)}
              className="kwd-btn kwd-btn-primary flex-1 text-xs"
            >
              Übernehmen
            </button>
            <button type="button" onClick={() => setOpen(false)} className="kwd-btn text-xs">
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
