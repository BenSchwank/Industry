import { useState, type FormEvent } from 'react'
import { useCreateInventoryBatch } from '../../hooks/useInventory'

interface BatchAddFormProps {
  itemId: string
  onSaved: () => void
}

export function BatchAddForm({ itemId, onSaved }: BatchAddFormProps) {
  const [batchNumber, setBatchNumber] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [location, setLocation] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createBatch = useCreateInventoryBatch()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createBatch.mutateAsync({
        item_id: itemId,
        batch_number: batchNumber,
        quantity,
        location: location || null,
        expiry_date: expiryDate || null,
      })
      setBatchNumber('')
      setQuantity(1)
      setLocation('')
      setExpiryDate('')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-kwd-bg border-kwd-surface-light rounded-lg border p-3">
      <p className="mb-2 text-sm font-bold">Charge einbuchen (FIFO)</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={batchNumber}
          onChange={(e) => setBatchNumber(e.target.value)}
          required
          placeholder="Chargen-Nr."
          className="bg-kwd-surface h-9 rounded border border-kwd-surface-light px-2 text-sm"
        />
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
          placeholder="Menge"
          className="bg-kwd-surface h-9 rounded border border-kwd-surface-light px-2 text-sm"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Lagerplatz"
          className="bg-kwd-surface h-9 rounded border border-kwd-surface-light px-2 text-sm"
        />
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="bg-kwd-surface h-9 rounded border border-kwd-surface-light px-2 text-sm"
        />
      </div>
      {error && <p className="text-kwd-danger mt-2 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={createBatch.isPending}
        className="bg-kwd-primary text-kwd-bg mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
      >
        {createBatch.isPending ? 'Speichern…' : 'Charge speichern'}
      </button>
    </form>
  )
}
