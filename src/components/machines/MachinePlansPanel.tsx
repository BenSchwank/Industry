import { useState } from 'react'
import {
  useActivateMaintenanceDraft,
  useAddDraftItem,
  useDeleteDraftItem,
  useMaintenanceDrafts,
  useRejectMaintenanceDraft,
  useUpdateDraftItem,
  useUpdateDraftMeta,
  type MaintenanceDraft,
} from '../../hooks/useMaintenanceDrafts'

interface MachinePlansPanelProps {
  machineId: string
  machineName: string
}

/** Wartungspläne aus Dokument-Analysen – Checkliste bearbeiten & freigeben */
export function MachinePlansPanel({ machineId, machineName }: MachinePlansPanelProps) {
  const { data: drafts = [], isLoading } = useMaintenanceDrafts(machineId)
  const activate = useActivateMaintenanceDraft()
  const reject = useRejectMaintenanceDraft()
  const updateItem = useUpdateDraftItem()
  const addItem = useAddDraftItem()
  const deleteItem = useDeleteDraftItem()
  const updateMeta = useUpdateDraftMeta()
  const [error, setError] = useState<string | null>(null)

  const readyDrafts = drafts.filter((d) => d.status === 'ready' || d.status === 'draft')
  const processing = drafts.filter((d) => d.status === 'processing')

  if (isLoading) {
    return <p className="text-kwd-muted p-4 text-sm">Lade Pläne…</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="kwd-panel">
        <div className="kwd-panel-head">Wartungspläne aus Dokumenten</div>
        <p className="text-kwd-muted border-kwd-border border-b px-3 py-2 text-sm">
          Checkliste prüfen, anpassen und freigeben – für {machineName}
        </p>

        {processing.length > 0 && (
          <p className="bg-kwd-primary/10 text-kwd-primary m-3 border border-[color-mix(in_srgb,var(--kwd-primary)_30%,transparent)] px-3 py-2 text-sm font-medium">
            {processing.length} Analyse(n) laufen…
          </p>
        )}

        {error && (
          <p className="text-kwd-danger bg-kwd-danger/10 border-kwd-danger m-3 border px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {readyDrafts.length === 0 && processing.length === 0 && (
          <p className="text-kwd-muted px-4 py-10 text-center text-sm">
            Noch kein Plan. Unter „Unterlagen“ ein PDF analysieren und „KI-Wartungsplan“ starten.
          </p>
        )}
      </section>

      {readyDrafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          onUpdateMeta={(title, freq) =>
            updateMeta.mutateAsync({ id: draft.id, title, frequency_days: freq, machineId })
          }
          onUpdateItem={(id, label) => updateItem.mutateAsync({ id, label, machineId })}
          onAddItem={(label) =>
            addItem.mutateAsync({
              draftId: draft.id,
              label,
              sortOrder: draft.items.length + 1,
              machineId,
            })
          }
          onDeleteItem={(id) => deleteItem.mutateAsync({ id, machineId })}
          onActivate={async () => {
            setError(null)
            try {
              await activate.mutateAsync(draft)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen')
            }
          }}
          onReject={async () => {
            if (!confirm('Entwurf verwerfen?')) return
            await reject.mutateAsync({ id: draft.id, machineId })
          }}
          activating={activate.isPending}
        />
      ))}
    </div>
  )
}

function DraftCard({
  draft,
  onUpdateMeta,
  onUpdateItem,
  onAddItem,
  onDeleteItem,
  onActivate,
  onReject,
  activating,
}: {
  draft: MaintenanceDraft
  onUpdateMeta: (title: string, freq: number) => Promise<void>
  onUpdateItem: (id: string, label: string) => Promise<void>
  onAddItem: (label: string) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
  onActivate: () => Promise<void>
  onReject: () => Promise<void>
  activating: boolean
}) {
  const [title, setTitle] = useState(draft.title)
  const [frequency, setFrequency] = useState(draft.frequency_days ?? 30)
  const [newItem, setNewItem] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const fieldCls =
    'border-kwd-border bg-kwd-paper text-kwd-text mt-1 min-h-[44px] w-full border px-3 text-base'

  return (
    <article className="kwd-panel">
      <div className="kwd-panel-head flex flex-wrap items-center justify-between gap-2">
        <span>Entwurf · noch nicht aktiv</span>
        <span className="text-kwd-muted text-xs font-normal normal-case tracking-normal">
          {draft.items.length} Checkpunkte
        </span>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <label className="block">
          <span className="kwd-kpi-label">Titel</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== draft.title && void onUpdateMeta(title, frequency)}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="kwd-kpi-label">Intervall (Tage)</span>
          <input
            type="number"
            min={1}
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
            onBlur={() => void onUpdateMeta(title, frequency)}
            className={fieldCls}
          />
        </label>
      </div>

      <div className="border-kwd-border border-t px-3 py-2">
        <p className="kwd-kpi-label mb-2">Checkliste prüfen</p>
        <ul className="flex flex-col gap-1.5">
          {draft.items.map((item, idx) => (
            <li
              key={item.id}
              className="border-kwd-border bg-kwd-bg flex items-start gap-3 border px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={Boolean(checked[item.id])}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))
                }
                className="accent-kwd-primary mt-1 h-5 w-5 shrink-0"
                title="Geprüft"
              />
              <span className="text-kwd-muted w-6 shrink-0 pt-0.5 text-sm font-mono">
                {idx + 1}.
              </span>
              {editingId === item.id ? (
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className={`${fieldCls} mt-0 min-h-[40px] flex-1`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await onUpdateItem(item.id, editLabel)
                      setEditingId(null)
                    }}
                    className="kwd-btn kwd-btn-primary"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className={`min-w-0 flex-1 text-base leading-snug ${
                      checked[item.id] ? 'text-kwd-muted line-through' : ''
                    }`}
                  >
                    {item.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(item.id)
                      setEditLabel(item.label)
                    }}
                    className="kwd-btn shrink-0"
                  >
                    Ändern
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteItem(item.id)}
                    className="kwd-btn kwd-btn-danger shrink-0"
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Neuer Checkpunkt…"
            className={`${fieldCls} mt-0 flex-1`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newItem.trim()) {
                void onAddItem(newItem.trim()).then(() => setNewItem(''))
              }
            }}
          />
          <button
            type="button"
            disabled={!newItem.trim()}
            onClick={async () => {
              await onAddItem(newItem.trim())
              setNewItem('')
            }}
            className="kwd-btn kwd-btn-primary"
          >
            + Punkt
          </button>
        </div>
      </div>

      <div className="border-kwd-border flex flex-wrap gap-2 border-t p-3">
        <button
          type="button"
          onClick={() => void onActivate()}
          disabled={activating || draft.items.length === 0}
          className="kwd-btn kwd-btn-primary min-h-[48px]"
        >
          {activating ? 'Aktiviere…' : 'Freigeben & aktivieren'}
        </button>
        <button type="button" onClick={() => void onReject()} className="kwd-btn min-h-[48px]">
          Verwerfen
        </button>
      </div>
    </article>
  )
}
