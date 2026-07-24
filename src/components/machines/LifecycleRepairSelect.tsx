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

type PickFilter = 'work' | 'repair' | 'all'

const TYPE_LABEL: Record<string, string> = {
  repair: 'Reparatur',
  maintenance: 'Wartung',
  inspection: 'Inspektion',
  note: 'Notiz',
}

/**
 * Auswahl bestehender Lebenszyklus-Einträge zur Verknüpfung mit einer Störung.
 * Standard: Wartungen und geplante Reparaturen (Monteur-Termine).
 */
export function LifecycleRepairSelect({
  machineId,
  value,
  onChange,
  disabled,
}: LifecycleRepairSelectProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PickFilter>('work')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['lifecycle-pick', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const full = await supabase
        .from('machine_lifecycle_entries')
        .select('id, entry_type, title, description, occurred_at, next_due_date')
        .eq('machine_id', machineId!)
        .in('entry_type', ['repair', 'maintenance', 'inspection', 'note'])
        .order('occurred_at', { ascending: false })
        .limit(80)

      if (!full.error) return (full.data ?? []) as LifecyclePickEntry[]

      if (/next_due_date|schema cache/i.test(full.error.message)) {
        const basic = await supabase
          .from('machine_lifecycle_entries')
          .select('id, entry_type, title, description, occurred_at')
          .eq('machine_id', machineId!)
          .in('entry_type', ['repair', 'maintenance', 'inspection', 'note'])
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
    const terms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    return entries.filter((e) => {
      if (filter === 'work' && e.entry_type !== 'repair' && e.entry_type !== 'maintenance') {
        return false
      }
      if (filter === 'repair' && e.entry_type !== 'repair') return false
      if (terms.length === 0) return true
      const hay = [
        e.title,
        e.description ?? '',
        TYPE_LABEL[e.entry_type] ?? '',
        e.next_due_date ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [entries, filter, query])

  const selected = entries.find((e) => e.id === value) ?? null

  if (!machineId) return null

  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="text-kwd-muted text-sm font-medium">
        Wartung / geplante Reparatur
      </legend>
      <p className="text-kwd-muted mt-1 text-xs">
        Optional verknüpfen – inkl. geplanter Monteur-Termine bei Reparaturen.
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => {
            onChange('', null)
            setFilter('work')
          }}
          className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold sm:text-sm ${
            !value
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          Neue Störung
        </button>
        <button
          type="button"
          onClick={() => setFilter('work')}
          className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold sm:text-sm ${
            filter === 'work'
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          Wartung / Reparatur
        </button>
        <button
          type="button"
          onClick={() => setFilter(filter === 'all' ? 'repair' : 'all')}
          className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold sm:text-sm ${
            filter === 'all' || filter === 'repair'
              ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
              : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
          }`}
        >
          {filter === 'all' ? 'Alle Einträge' : 'Nur Reparaturen'}
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
          {selected.next_due_date
            ? ` · Monteur: ${new Date(selected.next_due_date).toLocaleDateString('de-DE')}`
            : ''}
        </p>
      )}

      <ul className="border-kwd-border mt-2 max-h-48 overflow-y-auto rounded-xl border">
        {isLoading && (
          <li className="text-kwd-muted px-3 py-3 text-sm">Lade Lebenszyklus…</li>
        )}
        {!isLoading && filtered.length === 0 && (
          <li className="text-kwd-muted px-3 py-3 text-sm">
            {filter === 'work'
              ? 'Keine Wartungen oder Reparaturen – ggf. „Alle Einträge“ wählen.'
              : filter === 'repair'
                ? 'Keine Reparaturen für diese Maschine.'
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
    </fieldset>
  )
}
