import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { normalizeBarcode, suggestInventoryBarcode } from '../lib/barcode'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'

export interface InventoryItemInput {
  barcode: string
  name: string
  category?: string | null
  min_stock_level?: number
}

export interface InventoryBatchInput {
  item_id: string
  batch_number: string
  quantity: number
  location?: string | null
  expiry_date?: string | null
}

export interface InventoryItemWithStock {
  id: string
  barcode: string
  name: string
  category: string | null
  min_stock_level: number
  total_stock: number
}

export function useInventoryItems() {
  return useQuery({
    queryKey: ['inventory-with-stock'],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from('inventory_items')
        .select('id, barcode, name, category, min_stock_level')
        .order('name')
      if (error) throw error

      const { data: batches } = await supabase
        .from('inventory_batches')
        .select('item_id, quantity')

      const stockMap = new Map<string, number>()
      for (const b of batches ?? []) {
        stockMap.set(b.item_id, (stockMap.get(b.item_id) ?? 0) + b.quantity)
      }

      return (items ?? []).map((item) => ({
        ...item,
        total_stock: stockMap.get(item.id) ?? 0,
      })) satisfies InventoryItemWithStock[]
    },
  })
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: InventoryItemInput) => {
      const barcode = normalizeBarcode(input.barcode)
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          barcode,
          name: input.name.trim(),
          category: input.category?.trim() || null,
          min_stock_level: input.min_stock_level ?? 0,
        })
        .select('id, barcode, name')
        .single()

      if (error) throw new Error(formatSupabaseError(error))
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-with-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
    },
  })
}

export function useCreateInventoryBatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: InventoryBatchInput) => {
      const { data, error } = await supabase
        .from('inventory_batches')
        .insert({
          item_id: input.item_id,
          batch_number: input.batch_number.trim(),
          quantity: input.quantity,
          location: input.location?.trim() || null,
          expiry_date: input.expiry_date || null,
          received_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw new Error(formatSupabaseError(error))
      return data
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-with-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-batches', vars.item_id] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
    },
  })
}

export { suggestInventoryBarcode }
