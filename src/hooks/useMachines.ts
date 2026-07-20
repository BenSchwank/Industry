import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { normalizeBarcode } from '../lib/barcode'
import { formatSupabaseError } from '../lib/formatError'
import { applyMachineInitialDates } from '../lib/machineInitialDates'
import { rememberMachineFieldOptions } from '../lib/machineFieldOptions'
import type { MachineStatus } from '../types/database'

export interface MachineInput {
  barcode: string
  name: string
  location: string
  category?: string | null
  warranty_until?: string | null
  status?: MachineStatus
  last_maintenance_at?: string | null
  next_maintenance_at?: string | null
  last_repair_at?: string | null
}

export function useMachines() {
  return useQuery({
    queryKey: ['machines'],
    queryFn: async () => {
      const full = await supabase
        .from('machines')
        .select('id, barcode, name, location, warranty_until, status, external_source, created_at')
        .order('name')

      if (!full.error) return full.data

      // Fallback wenn Migration 005 noch nicht ausgeführt
      const basic = await supabase
        .from('machines')
        .select('id, barcode, name, location, warranty_until, status, created_at')
        .order('name')

      if (basic.error) throw basic.error
      return basic.data.map((m) => ({ ...m, external_source: null as string | null }))
    },
  })
}

export function useCreateMachine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: MachineInput) => {
      const barcode = normalizeBarcode(input.barcode)
      const payload = {
        barcode,
        name: input.name.trim(),
        location: input.location.trim(),
        category: input.category?.trim() || null,
        warranty_until: input.warranty_until || null,
        status: input.status ?? 'active',
      }
      let { data, error } = await supabase
        .from('machines')
        .insert(payload)
        .select('id, barcode, name')
        .single()

      if (error && /category|schema cache/i.test(error.message)) {
        const { category: _c, ...withoutCategory } = payload
        ;({ data, error } = await supabase
          .from('machines')
          .insert(withoutCategory)
          .select('id, barcode, name')
          .single())
      }

      if (error) {
        throw new Error(formatSupabaseError(error))
      }
      if (!data) {
        throw new Error('Maschine konnte nicht angelegt werden')
      }

      try {
        await applyMachineInitialDates(data.id, input)
      } catch (dateErr) {
        console.warn('[KWD] Initiale Termine konnten nicht gespeichert werden:', dateErr)
      }
      await rememberMachineFieldOptions({
        category: payload.category,
        location: payload.location,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machines-select'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    },
  })
}

export function useBulkCreateMachines() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inputs: MachineInput[]) => {
      const results: { id: string; name: string }[] = []
      const errors: string[] = []

      for (const input of inputs) {
        try {
          const barcode = normalizeBarcode(input.barcode)
          const payload = {
            barcode,
            name: input.name.trim(),
            location: input.location.trim(),
            category: input.category?.trim() || null,
            warranty_until: input.warranty_until || null,
            status: input.status ?? 'active',
          }
          let { data, error } = await supabase
            .from('machines')
            .insert(payload)
            .select('id, name')
            .single()

          if (error && /category|schema cache/i.test(error.message)) {
            const { category: _c, ...withoutCategory } = payload
            ;({ data, error } = await supabase
              .from('machines')
              .insert(withoutCategory)
              .select('id, name')
              .single())
          }

          if (error) throw new Error(formatSupabaseError(error))
          if (!data) throw new Error('Maschine konnte nicht angelegt werden')
          try {
            await applyMachineInitialDates(data.id, input)
          } catch {
            /* Maschine wurde angelegt – Termine optional */
          }
          await rememberMachineFieldOptions({
            category: payload.category,
            location: payload.location,
          })
          results.push(data)
        } catch (err) {
          errors.push(`${input.name}: ${err instanceof Error ? err.message : 'Fehler'}`)
        }
      }

      return { results, errors }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machines-select'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    },
  })
}

export function useUpdateMachine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<MachineInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('machines')
        .update({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.location !== undefined ? { location: input.location.trim() } : {}),
          ...(input.category !== undefined
            ? { category: input.category?.trim() || null }
            : {}),
          ...(input.warranty_until !== undefined
            ? { warranty_until: input.warranty_until || null }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.barcode !== undefined ? { barcode: normalizeBarcode(input.barcode) } : {}),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(formatSupabaseError(error))
      await rememberMachineFieldOptions({
        category: input.category,
        location: input.location,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machines-select'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    },
  })
}

export function useDeleteMachines() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return { deleted: 0 }
      const { error } = await supabase.from('machines').delete().in('id', ids)
      if (error) throw new Error(formatSupabaseError(error))
      return { deleted: ids.length }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machines-select'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
  })
}

export function useDuplicateMachines() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      machines: {
        barcode: string
        name: string
        location: string | null
        category?: string | null
        warranty_until: string | null
        status: MachineStatus
      }[],
    ) => {
      const results: { id: string; name: string }[] = []
      const errors: string[] = []

      for (const m of machines) {
        try {
          const baseName = m.name.replace(/\s*\(Kopie( \d+)?\)\s*$/i, '').trim()
          const name = `${baseName} (Kopie)`
          const barcode = suggestUniqueBarcode(baseName)
          const { data, error } = await supabase
            .from('machines')
            .insert({
              barcode,
              name,
              location: (m.location ?? '').trim() || 'Unbekannt',
              category: m.category?.trim() || null,
              warranty_until: m.warranty_until,
              status: m.status,
            })
            .select('id, name')
            .single()
          if (error) throw new Error(formatSupabaseError(error))
          await rememberMachineFieldOptions({
            category: m.category,
            location: (m.location ?? '').trim() || 'Unbekannt',
          })
          results.push(data)
        } catch (err) {
          errors.push(`${m.name}: ${err instanceof Error ? err.message : 'Fehler'}`)
        }
      }

      return { results, errors }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machines-select'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    },
  })
}

function suggestUniqueBarcode(fromName: string) {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5)
  const slug = fromName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 8) || 'MASCH'
  return normalizeBarcode(`KWD-M-${slug}-${stamp}`)
}
