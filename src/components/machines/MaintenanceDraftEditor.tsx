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

interface MaintenanceDraftEditorProps {
  machineId: string
}

export function MaintenanceDraftEditor({ machineId }: MaintenanceDraftEditorProps) {
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

  if (isLoading) return null
  if (drafts.length === 0) return null

  return (
    <section className="bg-kwd-surface border-kwd-primary/40 mt-4 rounded-xl border-2 p-4">
      <header className="mb-4">
        <h3 className="font-bold">KI-Wartungsentwürfe</h3>
        <p className="text-kwd-muted text-sm">
          Entwürfe prüfen & bearbeiten – erst nach Freigabe aktiv
        </p>
      </header>

      {processing.length > 0 && (
        <p className="text-kwd-primary bg-kwd-primary/10 mb-3 rounded-lg px-3 py-2 text-sm">
          {processing.length} Analyse(n) laufen im Hintergrund…
        </p>
      )}

      {error && <p className="text-kwd-danger mb-3 text-sm">{error}</p>}

      <div className="flex flex-col gap-4">
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
    </section>
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

  return (
    <article className="bg-kwd-bg border-kwd-surface-light rounded-lg border p-4">
      <p className="text-kwd-warning text-xs font-bold uppercase">Entwurf · nicht aktiv</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-kwd-muted text-xs">Titel</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== draft.title && onUpdateMeta(title, frequency)}
            className="bg-kwd-surface mt-1 min-h-[44px] w-full rounded-lg border border-kwd-surface-light px-3 text-base"
          />
        </label>
        <label className="block">
          <span className="text-kwd-muted text-xs">Intervall (Tage)</span>
          <input
            type="number"
            min={1}
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
            onBlur={() => onUpdateMeta(title, frequency)}
            className="bg-kwd-surface mt-1 min-h-[44px] w-full rounded-lg border border-kwd-surface-light px-3 text-base"
          />
        </label>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {draft.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            {editingId === item.id ? (
              <>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="bg-kwd-surface min-h-[44px] flex-1 rounded-lg border border-kwd-surface-light px-3 text-base"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateItem(item.id, editLabel)
                    setEditingId(null)
                  }}
                  className="bg-kwd-primary text-kwd-bg rounded px-3 py-2 text-xs font-bold"
                >
                  OK
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{item.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id)
                    setEditLabel(item.label)
                  }}
                  className="text-kwd-primary text-xs font-semibold"
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="text-kwd-danger text-xs"
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
          className="bg-kwd-surface min-h-[44px] flex-1 rounded-lg border border-kwd-surface-light px-3 text-base"
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && newItem.trim()) {
              await onAddItem(newItem.trim())
              setNewItem('')
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
          className="bg-kwd-surface-light min-h-[44px] rounded-lg px-4 text-sm font-bold disabled:opacity-50"
        >
          +
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onActivate}
          disabled={activating || draft.items.length === 0}
          className="bg-kwd-success text-kwd-bg min-h-[48px] rounded-xl px-5 font-bold disabled:opacity-50"
        >
          {activating ? 'Aktiviere…' : 'Freigeben & aktivieren'}
        </button>
        <button
          type="button"
          onClick={onReject}
          className="bg-kwd-surface-light min-h-[48px] rounded-xl px-5 font-semibold"
        >
          Verwerfen
        </button>
      </div>
    </article>
  )
}
