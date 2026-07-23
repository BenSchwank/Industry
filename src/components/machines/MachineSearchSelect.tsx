import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { machineMenuName, machineNameSearchText } from '../../lib/machineNames'
import { supabase } from '../../lib/supabase'

export interface MachineOption {
  id: string
  name: string
  barcode: string
  label_name?: string | null
  location?: string | null
}

interface MachineSearchSelectProps {
  value: string
  onChange: (machineId: string, machine: MachineOption | null) => void
  required?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
}

function matchesMachine(m: MachineOption, query: string) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) return true
  const hay = [
    m.barcode,
    m.name,
    m.label_name ?? '',
    m.location ?? '',
    machineNameSearchText(m),
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((t) => hay.includes(t))
}

/** Durchsuchbare Maschinenauswahl für Störungsmeldung u. a. */
export function MachineSearchSelect({
  value,
  onChange,
  required,
  disabled,
  placeholder = 'Maschine suchen (Name, Nummer, Standort)…',
  className = '',
}: MachineSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: machines = [], isLoading } = useQuery({
    queryKey: ['machines-select'],
    queryFn: async () => {
      const full = await supabase
        .from('machines')
        .select('id, name, barcode, label_name, location')
        .order('name')
      if (!full.error) return (full.data ?? []) as MachineOption[]

      const basic = await supabase.from('machines').select('id, name, barcode, location').order('name')
      if (basic.error) throw basic.error
      return (basic.data ?? []).map((m) => ({
        ...m,
        label_name: null as string | null,
      })) as MachineOption[]
    },
  })

  const selected = useMemo(
    () => machines.find((m) => m.id === value) ?? null,
    [machines, value],
  )

  const filtered = useMemo(() => {
    const list = machines.filter((m) => matchesMachine(m, query))
    return list.slice(0, 80)
  }, [machines, query])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  function selectMachine(m: MachineOption) {
    onChange(m.id, m)
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange('', null)
    setQuery('')
    setOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <span className="text-kwd-muted text-sm font-medium">
        Maschine {required ? '*' : ''}
      </span>

      {selected && !open ? (
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="bg-kwd-bg border-kwd-surface-light min-h-[52px] flex-1 rounded-xl border px-4 text-left"
          >
            <span className="block font-semibold">{machineMenuName(selected)}</span>
            <span className="text-kwd-muted block text-xs">
              {selected.barcode}
              {selected.location ? ` · ${selected.location}` : ''}
              {selected.label_name &&
              selected.label_name.trim().toLowerCase() !== selected.name.trim().toLowerCase()
                ? ` · Datenname: ${selected.name}`
                : ''}
            </span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={clear}
            className="kwd-btn min-h-[52px] shrink-0"
            title="Maschine wechseln"
          >
            Ändern
          </button>
        </div>
      ) : (
        <div className="relative mt-1">
          <input
            ref={inputRef}
            type="search"
            value={query}
            disabled={disabled}
            required={required && !value}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            className="bg-kwd-bg border-kwd-surface-light min-h-[52px] w-full rounded-xl border px-4 text-base"
            autoComplete="off"
          />
          {open && (
            <ul
              className="border-kwd-border bg-kwd-paper absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border shadow-lg"
              role="listbox"
            >
              {isLoading && (
                <li className="text-kwd-muted px-4 py-3 text-sm">Lade Maschinen…</li>
              )}
              {!isLoading && filtered.length === 0 && (
                <li className="text-kwd-muted px-4 py-3 text-sm">Keine Treffer</li>
              )}
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={m.id === value}
                    onClick={() => selectMachine(m)}
                    className={`hover:bg-kwd-primary/10 w-full px-4 py-3 text-left ${
                      m.id === value ? 'bg-kwd-primary/15' : ''
                    }`}
                  >
                    <span className="block font-semibold">{machineMenuName(m)}</span>
                    <span className="text-kwd-muted block text-xs">
                      {m.barcode}
                      {m.location ? ` · ${m.location}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
