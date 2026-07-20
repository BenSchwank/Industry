import { useState } from 'react'
import {
  BARCODE_PREFIX,
  normalizeBarcode,
  suggestInventoryBarcode,
  validateBarcode,
} from '../../lib/barcode'
import { useCreateInventoryItem } from '../../hooks/useInventory'

const inputCls =
  'bg-kwd-bg border-kwd-surface-light h-9 w-full min-w-0 rounded border px-2 text-sm'

interface InventoryAddRowProps {
  onSaved: (id: string) => void
  onCancel: () => void
}

export function InventoryAddRow({ onSaved, onCancel }: InventoryAddRowProps) {
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [category, setCategory] = useState('')
  const [minStock, setMinStock] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const createItem = useCreateInventoryItem()

  function suggestCode() {
    setBarcode(suggestInventoryBarcode(name || 'ARTIKEL'))
    setError(null)
  }

  async function save() {
    const validation = validateBarcode(barcode)
    if (!validation.valid) {
      setError(validation.error ?? 'Ungültiger Code')
      return
    }
    if (!name.trim()) {
      setError('Name erforderlich')
      return
    }

    try {
      const item = await createItem.mutateAsync({
        barcode,
        name,
        category: category || null,
        min_stock_level: minStock,
      })
      onSaved(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    }
  }

  return (
    <tr className="bg-kwd-primary/10 border-kwd-primary border-b-2">
      <td className="border-kwd-surface-light border px-2 py-2">
        <div className="flex gap-1">
          <input
            value={barcode}
            onChange={(e) => {
              setBarcode(normalizeBarcode(e.target.value))
              setError(null)
            }}
            placeholder={`${BARCODE_PREFIX.inventory}-…`}
            className={`${inputCls} font-mono text-xs min-w-[120px]`}
          />
          <button type="button" onClick={suggestCode} className="bg-kwd-surface-light rounded px-2 text-xs">
            ↻
          </button>
        </div>
      </td>
      <td className="border-kwd-surface-light border px-2 py-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artikelname" className={inputCls} />
      </td>
      <td className="border-kwd-surface-light border px-2 py-2">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kategorie" className={inputCls} />
      </td>
      <td className="border-kwd-surface-light border px-2 py-2">
        <input
          type="number"
          min={0}
          value={minStock}
          onChange={(e) => setMinStock(Number(e.target.value))}
          className={`${inputCls} w-20`}
        />
      </td>
      <td className="border-kwd-surface-light text-kwd-muted border px-2 py-2 text-xs">0</td>
      <td className="border-kwd-surface-light border px-2 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={save}
            disabled={createItem.isPending}
            className="bg-kwd-primary text-kwd-bg rounded px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          >
            {createItem.isPending ? '…' : 'Speichern'}
          </button>
          <button type="button" onClick={onCancel} className="bg-kwd-surface-light rounded px-2 py-1.5 text-xs">
            ✕
          </button>
        </div>
        {error && <p className="text-kwd-danger mt-1 text-xs">{error}</p>}
      </td>
    </tr>
  )
}
