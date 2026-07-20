import { useEffect, useRef, useState } from 'react'
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

/**
 * Popover: Kategorie wählen, neu anlegen, umbenennen oder löschen.
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
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setDraft(value)
      setRenaming(null)
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
      if (e.key === 'Escape') {
        if (renaming) setRenaming(null)
        else setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, renaming])

  function apply(next: string) {
    const trimmed = next.trim()
    onChange(trimmed)
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
    const ok = window.confirm(
      `Kategorie „${category}“ löschen?\n\nMaschinen darin landen unter „${UNCATEGORIZED_LABEL}“.`,
    )
    if (!ok) return
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

  return (
    <div className={`relative inline-flex ${className}`} ref={rootRef}>
      <button
        type="button"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`kwd-btn max-w-[10rem] truncate px-2 text-xs ${
          value.trim() ? 'kwd-btn-primary' : ''
        }`}
        title={title}
      >
        {pending ? '…' : label}
      </button>
      {open && (
        <div
          className="border-kwd-border bg-kwd-surface absolute top-full left-0 z-40 mt-1 w-[18rem] border p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
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
              className="border-kwd-border bg-kwd-paper h-8 min-w-0 flex-1 border px-2 text-sm"
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
                    className="border-kwd-border bg-kwd-paper h-7 min-w-0 flex-1 border px-1.5 text-xs"
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
        </div>
      )}
    </div>
  )
}
