import { useQuery } from '@tanstack/react-query'
import { BatchAddForm } from '../components/inventory/BatchAddForm'
import { InventoryTable } from '../components/inventory/InventoryTable'
import { useInventoryItems } from '../hooks/useInventory'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { useState } from 'react'

export default function InventoryPage() {
  const selectedId = useAppStore((s) => s.selectedInventoryItemId)
  const setSelectedInventoryItemId = useAppStore((s) => s.setSelectedInventoryItemId)
  const [showAddRow, setShowAddRow] = useState(false)

  const { data: items = [], isLoading, refetch } = useInventoryItems()

  const { data: batches } = useQuery({
    queryKey: ['inventory-batches', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_batches')
        .select('id, batch_number, expiry_date, quantity, location, received_at')
        .eq('item_id', selectedId!)
        .order('received_at', { ascending: true })
        .order('expiry_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })

  const selected = items.find((i) => i.id === selectedId)
  const totalStock = selected?.total_stock ?? batches?.reduce((sum, b) => sum + b.quantity, 0) ?? 0
  const fifoSuggestion = batches?.find((b) => b.quantity > 0)

  if (isLoading) {
    return <p className="text-kwd-muted p-4">Lade Lager…</p>
  }

  if (selected) {
    const belowMin = totalStock < selected.min_stock_level

    return (
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <button
          type="button"
          onClick={() => setSelectedInventoryItemId(null)}
          className="text-kwd-primary self-start text-sm font-semibold"
        >
          ← Alle Artikel
        </button>
        <article className="bg-kwd-surface rounded-xl p-5">
          <p className="text-kwd-primary text-xs font-bold uppercase">{selected.barcode}</p>
          <h2 className="mt-1 text-2xl font-bold">{selected.name}</h2>
          <p className="text-kwd-muted mt-1 text-sm">{selected.category ?? '–'}</p>
          <div className="mt-4 flex gap-4">
            <div className="bg-kwd-bg rounded-lg px-4 py-2">
              <p className="text-kwd-muted text-xs">Bestand</p>
              <p className={`text-xl font-bold ${belowMin ? 'text-kwd-danger' : 'text-kwd-success'}`}>
                {totalStock}
              </p>
            </div>
            <div className="bg-kwd-bg rounded-lg px-4 py-2">
              <p className="text-kwd-muted text-xs">Mindestbestand</p>
              <p className="text-xl font-bold">{selected.min_stock_level}</p>
            </div>
          </div>
          {belowMin && (
            <p className="text-kwd-danger bg-kwd-danger/10 mt-3 rounded-lg px-3 py-2 text-sm font-semibold">
              ⚠ Mindestbestand unterschritten!
            </p>
          )}
        </article>

        <BatchAddForm itemId={selected.id} onSaved={() => refetch()} />

        {fifoSuggestion && (
          <section className="border-kwd-primary bg-kwd-primary/10 rounded-xl border-2 p-4">
            <p className="text-kwd-primary text-xs font-bold uppercase">FIFO-Vorschlag</p>
            <p className="mt-1 font-bold">Charge {fifoSuggestion.batch_number}</p>
            <p className="text-kwd-muted text-sm">
              {fifoSuggestion.quantity} Stk. · Einlag.:{' '}
              {new Date(fifoSuggestion.received_at).toLocaleDateString('de-DE')}
              {fifoSuggestion.expiry_date &&
                ` · MHD: ${new Date(fifoSuggestion.expiry_date).toLocaleDateString('de-DE')}`}
            </p>
          </section>
        )}

        <section>
          <h3 className="mb-2 font-bold">Alle Chargen</h3>
          <ul className="flex flex-col gap-2">
            {batches?.length === 0 && (
              <li className="text-kwd-muted rounded-lg bg-kwd-surface p-4 text-sm">
                Noch keine Chargen – oben einbuchen.
              </li>
            )}
            {batches?.map((batch) => (
              <li
                key={batch.id}
                className="bg-kwd-surface flex items-center justify-between rounded-lg p-3 text-sm"
              >
                <span className="font-medium">{batch.batch_number}</span>
                <span className="text-kwd-muted">
                  {batch.quantity} Stk. · {batch.location ?? '–'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Lagerverwaltung</h2>
          <p className="text-kwd-muted text-sm">Artikel anlegen & Bestände per FIFO verwalten</p>
        </div>
        {!showAddRow && (
          <button
            type="button"
            onClick={() => setShowAddRow(true)}
            className="bg-kwd-primary text-kwd-bg rounded-lg px-4 py-2 text-sm font-bold"
          >
            + Neue Zeile
          </button>
        )}
      </header>

      <InventoryTable
        items={items}
        selectedId={selectedId}
        showAddRow={showAddRow}
        onSelect={setSelectedInventoryItemId}
        onAddCancel={() => setShowAddRow(false)}
        onAddSaved={(id) => {
          setShowAddRow(false)
          setSelectedInventoryItemId(id)
        }}
      />
    </div>
  )
}
