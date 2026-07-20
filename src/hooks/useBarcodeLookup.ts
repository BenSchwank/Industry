import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { normalizeBarcode, detectEntityType } from '../lib/barcode'

export type BarcodeLookupResult =
  | { type: 'machine'; id: string; name: string; barcode: string }
  | { type: 'inventory'; id: string; name: string; barcode: string }
  | { type: 'unknown'; barcode: string }

async function lookupBarcode(raw: string): Promise<BarcodeLookupResult> {
  const trimmed = normalizeBarcode(raw)
  if (!trimmed) return { type: 'unknown', barcode: trimmed }

  const hint = detectEntityType(trimmed)

  async function findMachine() {
    if (hint === 'inventory') return null
    const exact = await supabase
      .from('machines')
      .select('id, name, barcode')
      .eq('barcode', trimmed)
      .maybeSingle()
    if (exact.error) throw new Error(exact.error.message)
    if (exact.data) return exact.data
    // Fallback: Präfix-Suche falls QR anderen Text enthält
    const soft = await supabase
      .from('machines')
      .select('id, name, barcode')
      .ilike('barcode', `%${trimmed}%`)
      .limit(1)
    if (soft.error || !soft.data?.length) return null
    return soft.data[0]
  }

  async function findInventory() {
    if (hint === 'machine') return null
    const exact = await supabase
      .from('inventory_items')
      .select('id, name, barcode')
      .eq('barcode', trimmed)
      .maybeSingle()
    if (exact.error) throw new Error(exact.error.message)
    if (exact.data) return exact.data
    const soft = await supabase
      .from('inventory_items')
      .select('id, name, barcode')
      .ilike('barcode', `%${trimmed}%`)
      .limit(1)
    if (soft.error || !soft.data?.length) return null
    return soft.data[0]
  }

  const [machine, inventory] = await Promise.all([findMachine(), findInventory()])

  if (machine) return { type: 'machine', ...machine }
  if (inventory) return { type: 'inventory', ...inventory }
  return { type: 'unknown', barcode: trimmed }
}

export function useBarcodeLookup(barcode: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['barcode-lookup', barcode],
    queryFn: () => lookupBarcode(barcode!),
    enabled: enabled && Boolean(barcode),
    staleTime: 1000 * 60 * 10,
  })
}

export { lookupBarcode }
