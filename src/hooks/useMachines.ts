import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { normalizeBarcode } from '../lib/barcode'
import { formatSupabaseError } from '../lib/formatError'
import { applyMachineInitialDates } from '../lib/machineInitialDates'
import { rememberMachineFieldOptions } from '../lib/machineFieldOptions'
import { EMPTY_MACHINE_OIL_DATES, type MachineOilDates } from '../lib/machineOilDates'
import type { MachineWithStats } from './useMachinesWithStats'
import type { Database, MachineStatus } from '../types/database'

type MachineInsert = Database['public']['Tables']['machines']['Insert']
type MachineUpdate = Database['public']['Tables']['machines']['Update']

function asMachineInsert(payload: Record<string, unknown>): MachineInsert {
  return payload as MachineInsert
}

function asMachineUpdate(payload: Record<string, unknown>): MachineUpdate {
  return payload as MachineUpdate
}

export interface MachineInput {
  barcode: string
  name: string
  /** Anzeigename Zeichnung/Menü – optional, sonst = name */
  label_name?: string | null
  location: string
  category?: string | null
  warranty_until?: string | null
  status?: MachineStatus
  last_maintenance_at?: string | null
  next_maintenance_at?: string | null
  last_repair_at?: string | null
  last_cutting_oil_at?: string | null
  next_cutting_oil_at?: string | null
  last_hydraulic_oil_at?: string | null
  next_hydraulic_oil_at?: string | null
  last_maintenance_code?: string | null
  next_maintenance_code?: string | null
  last_hydraulic_code?: string | null
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
      const dataName = input.name.trim()
      const labelRaw = input.label_name?.trim() || null
      const labelName = labelRaw && labelRaw.toLowerCase() !== dataName.toLowerCase() ? labelRaw : null
      const payload = {
        barcode,
        name: dataName,
        label_name: labelName,
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

      if (error && /label_name|schema cache/i.test(error.message)) {
        const { label_name: _l, ...withoutLabel } = payload
        ;({ data, error } = await supabase
          .from('machines')
          .insert(withoutLabel)
          .select('id, barcode, name')
          .single())
      }

      if (error && /category|schema cache/i.test(error.message)) {
        const { category: _c, label_name: _l, ...withoutCategory } = payload
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
      const results: { id: string; name: string; updated?: boolean }[] = []
      const errors: string[] = []

      for (const input of inputs) {
        try {
          const outcome = await upsertMachineByName(input)
          results.push(outcome)
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

function oilPayloadFromInput(input: MachineInput): Partial<MachineOilDates> {
  const out: Partial<MachineOilDates> = {}
  for (const key of Object.keys(EMPTY_MACHINE_OIL_DATES) as (keyof MachineOilDates)[]) {
    if (input[key] !== undefined) {
      out[key] = input[key]?.toString().trim() || null
    }
  }
  return out
}

async function insertMachinePayload(
  payload: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  let { data, error } = await supabase
    .from('machines')
    .insert(asMachineInsert(payload))
    .select('id, name')
    .single()

  if (error && /label_name|schema cache/i.test(error.message) && 'label_name' in payload) {
    const { label_name: _l, ...rest } = payload
    ;({ data, error } = await supabase
      .from('machines')
      .insert(asMachineInsert(rest))
      .select('id, name')
      .single())
  }

  if (error && /category|schema cache/i.test(error.message) && 'category' in payload) {
    const { category: _c, label_name: _l, ...rest } = payload
    ;({ data, error } = await supabase
      .from('machines')
      .insert(asMachineInsert(rest))
      .select('id, name')
      .single())
  }

  if (
    error &&
    /cutting_oil|hydraulic_oil|maintenance_code|hydraulic_code/i.test(error.message)
  ) {
    const stripped = { ...payload }
    for (const k of Object.keys(EMPTY_MACHINE_OIL_DATES)) delete stripped[k]
    ;({ data, error } = await supabase
      .from('machines')
      .insert(asMachineInsert(stripped))
      .select('id, name')
      .single())
  }

  if (error) throw new Error(formatSupabaseError(error))
  if (!data) throw new Error('Maschine konnte nicht angelegt werden')
  return data
}

async function updateMachinePayload(
  id: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  let { data, error } = await supabase
    .from('machines')
    .update(asMachineUpdate(payload))
    .eq('id', id)
    .select('id, name')
    .single()

  if (error && /label_name|schema cache/i.test(error.message) && 'label_name' in payload) {
    const { label_name: _l, ...rest } = payload
    ;({ data, error } = await supabase
      .from('machines')
      .update(asMachineUpdate(rest))
      .eq('id', id)
      .select('id, name')
      .single())
  }

  if (error && /category|schema cache/i.test(error.message) && 'category' in payload) {
    const { category: _c, label_name: _l, ...rest } = payload
    ;({ data, error } = await supabase
      .from('machines')
      .update(asMachineUpdate(rest))
      .eq('id', id)
      .select('id, name')
      .single())
  }

  if (
    error &&
    /cutting_oil|hydraulic_oil|maintenance_code|hydraulic_code/i.test(error.message)
  ) {
    const stripped = { ...payload }
    for (const k of Object.keys(EMPTY_MACHINE_OIL_DATES)) delete stripped[k]
    ;({ data, error } = await supabase
      .from('machines')
      .update(asMachineUpdate(stripped))
      .eq('id', id)
      .select('id, name')
      .single())
  }

  if (error) throw new Error(formatSupabaseError(error))
  if (!data) throw new Error('Maschine konnte nicht aktualisiert werden')
  return data
}

/**
 * Gleicher Name → bestehende Maschine aktualisieren (Lebenszyklus/Tickets/Docs bleiben).
 * Neuer Name → anlegen.
 */
async function upsertMachineByName(
  input: MachineInput,
): Promise<{ id: string; name: string; updated: boolean }> {
  const barcode = normalizeBarcode(input.barcode)
  const dataName = input.name.trim()
  if (!dataName) throw new Error('Name fehlt')

  const labelRaw = input.label_name?.trim() || null
  const labelName =
    labelRaw && labelRaw.toLowerCase() !== dataName.toLowerCase() ? labelRaw : null
  const oil = oilPayloadFromInput(input)

  const { data: matches, error: findError } = await supabase
    .from('machines')
    .select('id, name, barcode')
    .ilike('name', dataName.replace(/[%_]/g, '\\$&'))

  if (findError) throw new Error(formatSupabaseError(findError))

  const exact = (matches ?? []).filter((m) => m.name.trim().toLowerCase() === dataName.toLowerCase())
  const existing = exact[0]

  if (existing) {
    const payload: Record<string, unknown> = {
      location: input.location.trim() || undefined,
      category: input.category?.trim() || null,
      warranty_until: input.warranty_until || null,
      status: input.status ?? undefined,
      label_name: labelName,
      ...oil,
    }
    // Leere Felder nicht mit undefined überschreiben – nur gesetzte Werte
    if (!input.location.trim()) delete payload.location
    if (input.category === undefined) delete payload.category
    if (input.warranty_until === undefined) delete payload.warranty_until
    if (input.status === undefined) delete payload.status
    if (input.label_name === undefined) delete payload.label_name

    // Barcode nur setzen, wenn bisher leer / Platzhalter
    const oldCode = (existing.barcode ?? '').trim()
    if ((!oldCode || /^AUTO/i.test(oldCode)) && barcode) {
      payload.barcode = barcode
    }

    const data = await updateMachinePayload(existing.id, payload)
    await rememberMachineFieldOptions({
      category: input.category,
      location: input.location,
    })
    // Kein applyMachineInitialDates → Lebenszyklus bleibt unberührt
    return { id: data.id, name: data.name, updated: true }
  }

  const payload: Record<string, unknown> = {
    barcode,
    name: dataName,
    label_name: labelName,
    location: input.location.trim(),
    category: input.category?.trim() || null,
    warranty_until: input.warranty_until || null,
    status: input.status ?? 'active',
    ...oil,
  }

  const data = await insertMachinePayload(payload)
  try {
    await applyMachineInitialDates(data.id, input)
  } catch {
    /* Termine optional */
  }
  await rememberMachineFieldOptions({
    category: payload.category as string | null,
    location: payload.location as string,
  })
  return { id: data.id, name: data.name, updated: false }
}

function isMissingColumnError(message: string, column: string): boolean {
  return (
    new RegExp(column, 'i').test(message) &&
    /schema cache|does not exist|could not find|unknown/i.test(message)
  )
}

const CATEGORY_COLUMN_HINT =
  'Kategorie-Spalte fehlt in Supabase. Bitte supabase/FIX_MACHINE_CATEGORY.sql im SQL-Editor ausführen und die Seite neu laden.'

async function updateMachineCategoryInDb(
  ids: string[],
  category: string | null,
): Promise<{ id: string; category: string | null }[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (uniqueIds.length === 0) return []

  const next = category?.trim() || null
  const { data, error } = await supabase
    .from('machines')
    .update({ category: next })
    .in('id', uniqueIds)
    .select('id, category')

  if (error) {
    if (isMissingColumnError(error.message, 'category')) {
      throw new Error(CATEGORY_COLUMN_HINT)
    }
    throw new Error(formatSupabaseError(error))
  }

  const rows = data ?? []
  if (rows.length === 0) {
    throw new Error('Kategorie konnte nicht gespeichert werden (keine Zeile geändert).')
  }

  // Antwort ohne category-Feld oder Wert nicht übernommen → Spalte fehlt / Schreibschutz
  for (const row of rows) {
    if (!('category' in row)) {
      throw new Error(CATEGORY_COLUMN_HINT)
    }
    const saved = (row.category as string | null)?.trim() || null
    if (saved !== next) {
      throw new Error(
        'Kategorie wurde nicht übernommen. Bitte supabase/FIX_MACHINE_CATEGORY.sql prüfen.',
      )
    }
  }

  await rememberMachineFieldOptions({ category: next })
  return rows.map((r) => ({
    id: r.id as string,
    category: ((r.category as string | null)?.trim() || null) as string | null,
  }))
}

function patchMachinesCategoryCache(
  queryClient: ReturnType<typeof useQueryClient>,
  patches: { id: string; category: string | null }[],
) {
  const map = new Map(patches.map((p) => [p.id, p.category]))
  queryClient.setQueryData<MachineWithStats[]>(['machines-with-stats'], (old) =>
    (old ?? []).map((m) => (map.has(m.id) ? { ...m, category: map.get(m.id)! } : m)),
  )
}

export function useUpdateMachine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<MachineInput> & { id: string }) => {
      // Kategorie allein → eigener Pfad (kein leeres Update-Fallback, das „erfolgreich“ aussieht)
      if (
        input.category !== undefined &&
        input.name === undefined &&
        input.label_name === undefined &&
        input.location === undefined &&
        input.warranty_until === undefined &&
        input.status === undefined &&
        input.barcode === undefined
      ) {
        const rows = await updateMachineCategoryInDb([id], input.category)
        return rows[0] ?? { id, category: input.category?.trim() || null }
      }

      const payload = {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.label_name !== undefined
          ? {
              label_name: (() => {
                const raw = input.label_name?.trim() || null
                const dataName = (input.name ?? '').trim()
                if (!raw) return null
                if (dataName && raw.toLowerCase() === dataName.toLowerCase()) return null
                return raw
              })(),
            }
          : {}),
        ...(input.location !== undefined ? { location: input.location.trim() } : {}),
        ...(input.category !== undefined
          ? { category: input.category?.trim() || null }
          : {}),
        ...(input.warranty_until !== undefined
          ? { warranty_until: input.warranty_until || null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.barcode !== undefined ? { barcode: normalizeBarcode(input.barcode) } : {}),
        ...(input.last_cutting_oil_at !== undefined
          ? { last_cutting_oil_at: input.last_cutting_oil_at || null }
          : {}),
        ...(input.next_cutting_oil_at !== undefined
          ? { next_cutting_oil_at: input.next_cutting_oil_at || null }
          : {}),
        ...(input.last_hydraulic_oil_at !== undefined
          ? { last_hydraulic_oil_at: input.last_hydraulic_oil_at || null }
          : {}),
        ...(input.next_hydraulic_oil_at !== undefined
          ? { next_hydraulic_oil_at: input.next_hydraulic_oil_at || null }
          : {}),
        ...(input.last_maintenance_code !== undefined
          ? { last_maintenance_code: input.last_maintenance_code?.trim() || null }
          : {}),
        ...(input.next_maintenance_code !== undefined
          ? { next_maintenance_code: input.next_maintenance_code?.trim() || null }
          : {}),
        ...(input.last_hydraulic_code !== undefined
          ? { last_hydraulic_code: input.last_hydraulic_code?.trim() || null }
          : {}),
      }

      let { data, error } = await supabase
        .from('machines')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (
        error &&
        isMissingColumnError(error.message, 'label_name') &&
        input.label_name !== undefined
      ) {
        const { label_name: _l, ...withoutLabel } = payload
        if (Object.keys(withoutLabel).length === 0) {
          throw new Error(
            'Spalte label_name fehlt in Supabase. Bitte supabase/FIX_MACHINE_LABEL_NAME.sql ausführen.',
          )
        }
        ;({ data, error } = await supabase
          .from('machines')
          .update(withoutLabel)
          .eq('id', id)
          .select()
          .single())
        if (!error) {
          throw new Error(
            'Spalte label_name fehlt in Supabase. Bitte supabase/FIX_MACHINE_LABEL_NAME.sql ausführen.',
          )
        }
      }

      if (
        error &&
        isMissingColumnError(error.message, 'category') &&
        input.category !== undefined
      ) {
        const { category: _c, ...withoutCategory } = payload
        if (Object.keys(withoutCategory).length === 0) {
          throw new Error(CATEGORY_COLUMN_HINT)
        }
        ;({ data, error } = await supabase
          .from('machines')
          .update(withoutCategory)
          .eq('id', id)
          .select()
          .single())
        if (!error) {
          throw new Error(CATEGORY_COLUMN_HINT)
        }
      }

      if (error && /cutting_oil|hydraulic_oil|maintenance_code|hydraulic_code/i.test(error.message)) {
        const stripped = { ...payload } as Record<string, unknown>
        for (const k of Object.keys(EMPTY_MACHINE_OIL_DATES)) delete stripped[k]
        if (Object.keys(stripped).length === 0) {
          throw new Error(
            'Öl-Spalten fehlen in Supabase. Bitte supabase/FIX_MACHINE_OIL_DATES.sql ausführen.',
          )
        }
        ;({ data, error } = await supabase
          .from('machines')
          .update(asMachineUpdate(stripped))
          .eq('id', id)
          .select()
          .single())
        if (!error) {
          throw new Error(
            'Öl-Spalten fehlen in Supabase. Bitte supabase/FIX_MACHINE_OIL_DATES.sql ausführen.',
          )
        }
      }

      if (error) throw new Error(formatSupabaseError(error))
      await rememberMachineFieldOptions({
        category: input.category,
        location: input.location,
      })
      return data
    },
    onMutate: async (input) => {
      if (input.category === undefined) return undefined
      await queryClient.cancelQueries({ queryKey: ['machines-with-stats'] })
      const list = queryClient.getQueryData<MachineWithStats[]>(['machines-with-stats'])
      const previousCategory = list?.find((m) => m.id === input.id)?.category ?? null
      const nextCategory = input.category?.trim() || null
      patchMachinesCategoryCache(queryClient, [{ id: input.id, category: nextCategory }])
      return { id: input.id, previousCategory }
    },
    onError: (_err, input, context) => {
      if (input.category === undefined || !context) return
      patchMachinesCategoryCache(queryClient, [
        { id: context.id, category: context.previousCategory },
      ])
    },
    onSuccess: (data, input) => {
      if (input.category !== undefined) {
        const saved =
          data && typeof data === 'object' && 'category' in data
            ? ((data as { category?: string | null }).category?.trim() || null)
            : input.category?.trim() || null
        patchMachinesCategoryCache(queryClient, [{ id: input.id, category: saved }])
      }
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machines-select'] })
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    },
  })
}

/** Mehrere Maschinen in eine Kategorie – ein DB-Call, kein Parallel-Optimistic-Race */
export function useSetMachinesCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { ids: string[]; category: string | null }) => {
      return updateMachineCategoryInDb(input.ids, input.category)
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['machines-with-stats'] })
      const list = queryClient.getQueryData<MachineWithStats[]>(['machines-with-stats']) ?? []
      const previous = input.ids.map((id) => ({
        id,
        category: list.find((m) => m.id === id)?.category ?? null,
      }))
      const next = input.category?.trim() || null
      patchMachinesCategoryCache(
        queryClient,
        input.ids.map((id) => ({ id, category: next })),
      )
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        patchMachinesCategoryCache(queryClient, context.previous)
      }
    },
    onSuccess: (rows) => {
      patchMachinesCategoryCache(queryClient, rows)
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
