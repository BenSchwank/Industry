import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { LifecycleEntryType } from '../../types/database'

export interface LifecyclePickEntry {
  id: string
  entry_type: LifecycleEntryType
  title: string
  description: string | null
  occurred_at: string
  next_due_date?: string | null
}

interface LifecycleRepairSelectProps {
  machineId: string | null
  value: string
  onChange: (entryId: string, entry: LifecyclePickEntry | null) => void
  disabled?: boolean
}

/** Keine Verknüpfung | normale Reparatur | geplante Reparatur (mit Monteur-Termin) */
type PickMode = 'none' | 'repair' | 'planned'

/**
 * Auswahl: Störung optional mit Reparatur oder geplanter Reparatur verknüpfen.
 */
export function LifecycleRepairSelect({
  machineId,
  value,
  onChange,
  disabled,
}: LifecycleRepairSelectProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<PickMode>('none')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['lifecycle-pick-repairs', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const full = await supabase
        .from('machine_lifecycle_entries')
        .select('id, entry_type, title, description, occurred_at, next_due_date')
        .eq('machine_id', machineId!)
        .eq('entry_type', 'repair')
        .order('occurred_at', { ascending: false })
        .limit(80)

      if (!full.error) return (full.data ?? []) as LifecyclePickEntry[]

      if (/next_due_date|schema cache/i.test(full.error.message)) {
        const basic = await supabase
          .from('machine_lifecycle_entries')
          .select('id, entry_type, title, description, occurred_at')
          .eq('machine_id', machineId!)
          .eq('entry_type', 'repair')
          .order('occurred_at', { ascending: false })
          .limit(80)
        if (basic.error) throw basic.error
        return (basic.data ?? []).map((e) => ({
          ...e,
          next_due_date: null as string | null,
        })) as LifecyclePickEntry[]
      }
      throw full.error
    },
  })

  const filtered = useMemo(() => {
    if (mode === 'none') return []
    const terms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    return entries.filter((e) => {
      const planned = Boolean(e.next_due_date?.trim())
      if (mode === 'planned' && !planned) return false
      if (mode === 'repair' && planned) return false
      if (terms.length === 0) return true
      const hay = [e.title, e.description ?? '', e.next_due_date ?? '']
        .join(' ')
        .toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [entries, mode, query])

  const selected = entries.find((e) => e.id === value) ?? null

  if (!machineId) return null

  function setPickMode(next: PickMode) {
    setMode(next)
    if (next === 'none') {
      onChange('', null)
      return
    }
    // Auswahl zurücksetzen, wenn Filter wechselt und bisheriger Eintrag nicht passt
    if (value) {
      const cur = entries.find((e) => e.id === value)
      const planned = Boolean(cur?.next_due_date?.trim())
      if (next === 'planned' && !planned) onChange('', null)
      if (next === 'repair' && planned) onChange('', null)
    }
  }

  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="text-kwd-muted text-sm font-medium">Reparatur verknüpfen</legend>
      <p className="text-kwd-muted mt-1 text-xs">
        Optional: bestehende Reparatur oder geplante Reparatur (Monteur-Termin) wählen.
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setPickMode('none')}
          className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold sm:text-sm ${
            mode === 'none'
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          Neue Störung
        </button>
        <button
          type="button"
          onClick={() => setPickMode('repair')}
          className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold sm:text-sm ${
            mode === 'repair'
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          Reparatur
        </button>
        <button
          type="button"
          onClick={() => setPickMode('planned')}
          className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold sm:text-sm ${
            mode === 'planned'
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          Geplante Reparatur
        </button>
      </div>

      {mode !== 'none' && (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === 'planned' ? 'Geplante Reparatur suchen…' : 'Reparatur suchen…'
            }
            className="bg-kwd-bg border-kwd-surface-light mt-2 min-h-[44px] w-full rounded-xl border px-4 text-sm"
          />

          {selected && (
            <p className="bg-kwd-primary/10 text-kwd-primary mt-2 rounded-lg px-3 py-2 text-sm">
              Verknüpft:{' '}
              {selected.next_due_date ? 'Geplante Reparatur' : 'Reparatur'} · {selected.title} ·{' '}
              {new Date(selected.occurred_at).toLocaleDateString('de-DE')}
              {selected.next_due_date
                ? ` · Monteur: ${new Date(selected.next_due_date).toLocaleDateString('de-DE')}`
                : ''}
            </p>
          )}

          <ul className="border-kwd-border mt-2 max-h-48 overflow-y-auto rounded-xl border">
            {isLoading && (
              <li className="text-kwd-muted px-3 py-3 text-sm">Lade Reparaturen…</li>
            )}
            {!isLoading && filtered.length === 0 && (
              <li className="text-kwd-muted px-3 py-3 text-sm">
                {mode === 'planned'
                  ? 'Keine geplanten Reparaturen (mit Monteur-Termin) für diese Maschine.'
                  : 'Keine Reparaturen ohne Termin für diese Maschine.'}
              </li>
            )}
            {filtered.map((e) => {
              const active = e.id === value
              return (
                <li key={e.id} className="border-kwd-border border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onChange(active ? '' : e.id, active ? null : e)}
                    className={`w-full px-3 py-2.5 text-left ${
                      active ? 'bg-kwd-primary/15' : 'hover:bg-kwd-surface-light'
                    }`}
                  >
                    <span className="text-kwd-muted block text-xs font-semibold">
                      {e.next_due_date ? 'Geplante Reparatur' : 'Reparatur'} ·{' '}
                      {new Date(e.occurred_at).toLocaleDateString('de-DE')}
                      {e.next_due_date
                        ? ` · Monteur ${new Date(e.next_due_date).toLocaleDateString('de-DE')}`
                        : ''}
                    </span>
                    <span className="block text-sm font-semibold">{e.title}</span>
                    {e.description && (
                      <span className="text-kwd-muted mt-0.5 line-clamp-2 block text-xs">
                        {e.description}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </fieldset>
  )
}
