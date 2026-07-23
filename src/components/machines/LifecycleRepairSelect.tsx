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
}

interface LifecycleRepairSelectProps {
  machineId: string | null
  value: string
  onChange: (entryId: string, entry: LifecyclePickEntry | null) => void
  disabled?: boolean
}

const TYPE_LABEL: Record<string, string> = {
  repair: 'Reparatur',
  maintenance: 'Wartung',
  inspection: 'Inspektion',
  note: 'Notiz',
}

/**
 * Auswahl bestehender Lebenszyklus-Einträge (v. a. Reparaturen) zur Verknüpfung
 * mit einer Störungsmeldung.
 */
export function LifecycleRepairSelect({
  machineId,
  value,
  onChange,
  disabled,
}: LifecycleRepairSelectProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'repair' | 'all'>('repair')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['lifecycle-pick', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machine_lifecycle_entries')
        .select('id, entry_type, title, description, occurred_at')
        .eq('machine_id', machineId!)
        .in('entry_type', ['repair', 'maintenance', 'inspection', 'note'])
        .order('occurred_at', { ascending: false })
        .limit(80)

      if (error) throw error
      return (data ?? []) as LifecyclePickEntry[]
    },
  })

  const filtered = useMemo(() => {
    const terms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    return entries.filter((e) => {
      if (filter === 'repair' && e.entry_type !== 'repair') return false
      if (terms.length === 0) return true
      const hay = `${e.title} ${e.description ?? ''} ${TYPE_LABEL[e.entry_type] ?? ''}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [entries, filter, query])

  const selected = entries.find((e) => e.id === value) ?? null

  if (!machineId) return null

  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="text-kwd-muted text-sm font-medium">Lebenszyklus / Reparatur</legend>
      <p className="text-kwd-muted mt-1 text-xs">
        Optional: bestehende Reparatur oder früheren Eintrag verknüpfen (Wiederkehr / Nacharbeit).
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            onChange('', null)
            setFilter('repair')
          }}
          className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
            !value
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          Neue Störung
        </button>
        <button
          type="button"
          onClick={() => setFilter(filter === 'repair' ? 'all' : 'repair')}
          className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
            value || filter === 'all'
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          {filter === 'repair' ? 'Reparaturen' : 'Alle Einträge'}
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Eintrag suchen…"
        className="bg-kwd-bg border-kwd-surface-light mt-2 min-h-[44px] w-full rounded-xl border px-4 text-sm"
      />

      {selected && (
        <p className="bg-kwd-primary/10 text-kwd-primary mt-2 rounded-lg px-3 py-2 text-sm">
          Verknüpft: {TYPE_LABEL[selected.entry_type] ?? selected.entry_type} · {selected.title} ·{' '}
          {new Date(selected.occurred_at).toLocaleDateString('de-DE')}
        </p>
      )}

      <ul className="border-kwd-border mt-2 max-h-48 overflow-y-auto rounded-xl border">
        {isLoading && (
          <li className="text-kwd-muted px-3 py-3 text-sm">Lade Lebenszyklus…</li>
        )}
        {!isLoading && filtered.length === 0 && (
          <li className="text-kwd-muted px-3 py-3 text-sm">
            {filter === 'repair'
              ? 'Keine Reparaturen für diese Maschine – ggf. „Alle Einträge“ wählen.'
              : 'Keine Einträge gefunden.'}
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
                  {TYPE_LABEL[e.entry_type] ?? e.entry_type} ·{' '}
                  {new Date(e.occurred_at).toLocaleDateString('de-DE')}
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
    </fieldset>
  )
}
