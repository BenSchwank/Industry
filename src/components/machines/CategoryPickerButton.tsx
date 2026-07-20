import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { UNCATEGORIZED_LABEL } from '../../lib/machineCategories'

interface CategoryPickerProps {
  value: string
  suggestions: string[]
  /** Kurz-Label auf dem Button */
  buttonLabel?: string
  title?: string
  disabled?: boolean
  className?: string
  /** Kategorie zuweisen / neue anlegen */
  onChange: (category: string) => void
  /** Bestehende Kategorie umbenennen (alle Maschinen + Vokabular) */
  onRename?: (from: string, to: string) => void | Promise<void>
  /** Kategorie löschen (Maschinen → Ohne Kategorie, Vokabular weg) */
  onDelete?: (category: string) => void | Promise<void>
  busy?: boolean
}

const PANEL_WIDTH = 288

/**
 * Popover per Portal + fixed – verschiebt die Tabelle nicht.
 */
export function CategoryPickerButton({
  value,
  suggestions,
  buttonLabel,
  title = 'Kategorie wählen, anlegen, umbenennen oder löschen',
  disabled,
  className = '',
  onChange,
  onRename,
  onDelete,
  busy = false,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function updatePosition() {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const gap = 4
    let left = rect.right - PANEL_WIDTH
    if (left < 8) left = 8
    if (left + PANEL_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - PANEL_WIDTH - 8)
    }
    let top = rect.bottom + gap
    const approxHeight = 320
    if (top + approxHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - approxHeight - gap)
    }
    setPos({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    updatePosition()
    setDraft(value)
    setRenaming(null)
    window.setTimeout(() => inputRef.current?.focus(), 0)

    function onScrollOrResize() {
      updatePosition()
    }
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  useEffect(() => {
    if (!open) return
    let onDoc: ((e: MouseEvent) => void) | null = null
    let onKey: ((e: KeyboardEvent) => void) | null = null
    // erst nach dem Öffnen-Klick registrieren, sonst schließt sich das Menü sofort
    const timer = window.setTimeout(() => {
      onDoc = (e: MouseEvent) => {
        const t = e.target as Node
        if (buttonRef.current?.contains(t)) return
        if (panelRef.current?.contains(t)) return
        setOpen(false)
      }
      onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (renaming) setRenaming(null)
          else setOpen(false)
        }
      }
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (onDoc) document.removeEventListener('mousedown', onDoc)
      if (onKey) document.removeEventListener('keydown', onKey)
    }
  }, [open, renaming])

  function apply(next: string) {
    onChange(next.trim())
    setOpen(false)
  }

  async function commitRename() {
    if (!renaming || !onRename) return
    const to = renameDraft.trim()
    if (!to) return
    if (to.toLowerCase() === renaming.toLowerCase()) {
      setRenaming(null)
      return
    }
    setPending(true)
    try {
      await onRename(renaming, to)
      setRenaming(null)
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  async function commitDelete(category: string) {
    if (!onDelete) return
    setPending(true)
    try {
      await onDelete(category)
      if (value.trim() === category) onChange('')
    } finally {
      setPending(false)
    }
  }

  const label = buttonLabel ?? (value.trim() || 'Kategorie')
  const locked = disabled || busy || pending

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Kategorie verwalten"
            className="border-kwd-border bg-kwd-paper text-kwd-text fixed z-[200] border p-2 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="text-kwd-muted mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
              Kategorie / Ordner
            </p>

            <div className="mb-2 flex gap-1">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    apply(draft)
                  }
                }}
                placeholder="neu tippen oder wählen…"
                disabled={locked}
                className="border-kwd-border bg-kwd-surface h-8 min-w-0 flex-1 border px-2 text-sm"
              />
              <button
                type="button"
                disabled={locked || !draft.trim()}
                onClick={() => apply(draft)}
                className="kwd-btn kwd-btn-primary shrink-0 px-2 text-xs"
                title="Übernehmen / neu anlegen"
              >
                OK
              </button>
            </div>

            <div className="mb-2 flex max-h-52 flex-col gap-0.5 overflow-auto">
              <button
                type="button"
                disabled={locked}
                onClick={() => apply('')}
                className={`hover:bg-kwd-surface-light px-2 py-1.5 text-left text-xs ${
                  !value.trim() ? 'bg-kwd-primary/15 font-semibold' : ''
                }`}
              >
                {UNCATEGORIZED_LABEL}
              </button>

              {suggestions.map((c) =>
                renaming === c ? (
                  <div key={c} className="bg-kwd-surface-light flex items-center gap-1 px-1 py-1">
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void commitRename()
                        }
                      }}
                      disabled={locked}
                      className="border-kwd-border bg-kwd-surface h-7 min-w-0 flex-1 border px-1.5 text-xs"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={locked || !renameDraft.trim()}
                      onClick={() => void commitRename()}
                      className="kwd-btn kwd-btn-primary px-1.5 text-[10px]"
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setRenaming(null)}
                      className="kwd-btn px-1.5 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div
                    key={c}
                    className={`hover:bg-kwd-surface-light flex items-center gap-0.5 ${
                      c === value.trim() ? 'bg-kwd-primary/15' : ''
                    }`}
                  >
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => apply(c)}
                      className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs ${
                        c === value.trim() ? 'font-semibold' : ''
                      }`}
                    >
                      {c}
                    </button>
                    {onRename && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          setRenaming(c)
                          setRenameDraft(c)
                        }}
                        className="text-kwd-muted hover:text-kwd-primary shrink-0 px-1.5 text-[11px]"
                        title="Umbenennen"
                      >
                        ✎
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => void commitDelete(c)}
                        className="text-kwd-muted hover:text-kwd-danger shrink-0 px-1.5 text-[11px]"
                        title="Löschen"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ),
              )}

              {suggestions.length === 0 && (
                <p className="text-kwd-muted px-2 py-1 text-[11px]">
                  Noch keine Kategorien – oben eintippen und OK.
                </p>
              )}
            </div>

            <p className="text-kwd-muted text-[10px] leading-snug">
              Tippen + OK = zuweisen/anlegen · ✎ umbenennen · ✕ löschen
            </p>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`kwd-btn max-w-[10rem] truncate px-2 text-xs ${className} ${
          value.trim() ? 'kwd-btn-primary' : ''
        }`}
        title={title}
      >
        {pending ? '…' : label}
      </button>
      {panel}
    </>
  )
}
