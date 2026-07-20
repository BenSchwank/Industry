import type { InventoryItemWithStock } from '../../hooks/useInventory'
import { InventoryAddRow } from './InventoryAddRow'

interface InventoryTableProps {
  items: InventoryItemWithStock[]
  selectedId: string | null
  showAddRow: boolean
  onSelect: (id: string) => void
  onAddCancel: () => void
  onAddSaved: (id: string) => void
}

export function InventoryTable({
  items,
  selectedId,
  showAddRow,
  onSelect,
  onAddCancel,
  onAddSaved,
}: InventoryTableProps) {
  return (
    <div className="border-kwd-surface-light overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="bg-kwd-surface-light text-kwd-muted text-left text-xs font-bold uppercase tracking-wide">
              <th className="border-kwd-surface-light border px-3 py-2.5">Scan-Code</th>
              <th className="border-kwd-surface-light border px-3 py-2.5">Bezeichnung</th>
              <th className="border-kwd-surface-light border px-3 py-2.5">Kategorie</th>
              <th className="border-kwd-surface-light border px-3 py-2.5">Mindestbestand</th>
              <th className="border-kwd-surface-light border px-3 py-2.5">Bestand</th>
              <th className="border-kwd-surface-light border px-3 py-2.5 w-24"> </th>
            </tr>
          </thead>
          <tbody>
            {showAddRow && <InventoryAddRow onSaved={onAddSaved} onCancel={onAddCancel} />}
            {items.length === 0 && !showAddRow && (
              <tr>
                <td colSpan={6} className="text-kwd-muted border px-4 py-8 text-center">
                  Keine Artikel – „+ Neue Zeile" klicken.
                </td>
              </tr>
            )}
            {items.map((item, idx) => {
              const belowMin = item.total_stock < item.min_stock_level
              return (
                <tr
                  key={item.id}
                  className={`cursor-pointer ${
                    item.id === selectedId
                      ? 'bg-kwd-primary/15'
                      : idx % 2 === 0
                        ? 'bg-kwd-surface/40 hover:bg-kwd-surface'
                        : 'hover:bg-kwd-surface'
                  }`}
                  onClick={() => onSelect(item.id)}
                >
                  <td className="border-kwd-surface-light border px-3 py-2 font-mono text-xs font-semibold text-kwd-primary">
                    {item.barcode}
                  </td>
                  <td className="border-kwd-surface-light border px-3 py-2 font-medium">{item.name}</td>
                  <td className="border-kwd-surface-light text-kwd-muted border px-3 py-2">
                    {item.category ?? '–'}
                  </td>
                  <td className="border-kwd-surface-light border px-3 py-2">{item.min_stock_level}</td>
                  <td
                    className={`border-kwd-surface-light border px-3 py-2 font-semibold ${
                      belowMin ? 'text-kwd-danger' : 'text-kwd-success'
                    }`}
                  >
                    {item.total_stock}
                    {belowMin && ' ⚠'}
                  </td>
                  <td className="border-kwd-surface-light border px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(item.id)
                      }}
                      className="text-kwd-primary text-xs font-semibold hover:underline"
                    >
                      Details →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
