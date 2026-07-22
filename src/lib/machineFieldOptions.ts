import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import {
  DEFAULT_MACHINE_CATEGORIES,
  canonicalDefaultCategory,
  machineCategorySuggestions,
} from './machineCategories'
import { machineLocationSuggestions } from './machineLocations'

export type MachineFieldOptionType = 'category' | 'location'

const LOCAL_KEY = 'kwd-machine-field-options-v1'

type LocalStore = {
  category: string[]
  location: string[]
}

function readLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return { category: [], location: [] }
    const parsed = JSON.parse(raw) as Partial<LocalStore>
    return {
      category: Array.isArray(parsed.category) ? parsed.category : [],
      location: Array.isArray(parsed.location) ? parsed.location : [],
    }
  } catch {
    return { category: [], location: [] }
  }
}

function writeLocal(store: LocalStore) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store))
  } catch {
    /* ignore quota */
  }
}

function addLocal(fieldType: MachineFieldOptionType, value: string) {
  const v = value.trim()
  if (!v) return
  const store = readLocal()
  const list = store[fieldType]
  if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) {
    store[fieldType] = [...list, v].sort((a, b) => a.localeCompare(b, 'de'))
    writeLocal(store)
  }
}

function removeLocal(fieldType: MachineFieldOptionType, value: string) {
  const v = value.trim()
  if (!v) return
  const store = readLocal()
  store[fieldType] = store[fieldType].filter((x) => x.toLowerCase() !== v.toLowerCase())
  writeLocal(store)
}

/** Speichert einen Freitext-Wert dauerhaft (DB + lokal), ohne bestehende Optionen zu löschen */
export async function rememberMachineFieldOption(
  fieldType: MachineFieldOptionType,
  value: string | null | undefined,
): Promise<void> {
  const v = value?.trim()
  if (!v) return

  addLocal(fieldType, v)

  const { error } = await supabase.from('machine_field_options').upsert(
    { field_type: fieldType, value: v },
    { onConflict: 'field_type,value', ignoreDuplicates: true },
  )

  // Tabelle fehlt noch → lokal reicht als Fallback
  if (error && !/schema cache|does not exist|machine_field_options/i.test(error.message)) {
    console.warn('[KWD] field option:', error.message)
  }
}

/** Entfernt einen Vorschlag dauerhaft (DB + lokal) – Maschinen bleiben unberührt */
export async function forgetMachineFieldOption(
  fieldType: MachineFieldOptionType,
  value: string | null | undefined,
): Promise<void> {
  const v = value?.trim()
  if (!v) return

  removeLocal(fieldType, v)

  const { error } = await supabase
    .from('machine_field_options')
    .delete()
    .eq('field_type', fieldType)
    .eq('value', v)

  if (error && !/schema cache|does not exist|machine_field_options/i.test(error.message)) {
    console.warn('[KWD] field option delete:', error.message)
  }
}

/** Benennt einen Vorschlag um (DB + lokal) */
export async function renameMachineFieldOption(
  fieldType: MachineFieldOptionType,
  from: string,
  to: string,
): Promise<void> {
  const oldVal = from.trim()
  const newVal = to.trim()
  if (!oldVal || !newVal || oldVal.toLowerCase() === newVal.toLowerCase()) return

  await forgetMachineFieldOption(fieldType, oldVal)
  await rememberMachineFieldOption(fieldType, newVal)
}

export async function rememberMachineFieldOptions(input: {
  category?: string | null
  location?: string | null
}): Promise<void> {
  await Promise.all([
    rememberMachineFieldOption('category', input.category),
    rememberMachineFieldOption('location', input.location),
  ])
}

/**
 * Wartungsplan-Ordner anlegen und gleichnamige Einträge kanonisch überschreiben.
 * Andere (eigene) Kategorien bleiben erhalten. App-Seiten unverändert.
 */
export async function seedWartungsplanCategories(): Promise<void> {
  const local = readLocal()
  const remote = await fetchRemoteOptions('category')
  const existing = [...local.category, ...remote]

  for (const cat of DEFAULT_MACHINE_CATEGORIES) {
    const variants = existing.filter(
      (v) => v.trim().toLowerCase() === cat.toLowerCase() && v.trim() !== cat,
    )
    for (const variant of variants) {
      await renameMachineFieldOption('category', variant, cat)
    }
    await rememberMachineFieldOption('category', cat)
  }

  const { data: rows } = await supabase.from('machines').select('id, category')
  for (const row of rows ?? []) {
    const c = row.category?.trim()
    if (!c) continue
    const canon = canonicalDefaultCategory(c)
    if (canon && canon !== c) {
      await supabase.from('machines').update({ category: canon }).eq('id', row.id)
    }
  }
}

async function fetchRemoteOptions(fieldType: MachineFieldOptionType): Promise<string[]> {
  const { data, error } = await supabase
    .from('machine_field_options')
    .select('value')
    .eq('field_type', fieldType)
    .order('value')

  if (error) return []
  return (data ?? []).map((r) => r.value).filter(Boolean)
}

export function useMachineFieldOptions() {
  return useQuery({
    queryKey: ['machine-field-options'],
    queryFn: async () => {
      const local = readLocal()
      const [remoteCategories, remoteLocations] = await Promise.all([
        fetchRemoteOptions('category'),
        fetchRemoteOptions('location'),
      ])

      return {
        categories: machineCategorySuggestions([...local.category, ...remoteCategories]),
        locations: machineLocationSuggestions([...local.location, ...remoteLocations]),
      }
    },
    staleTime: 30_000,
  })
}

export function useRememberMachineFieldOptions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: rememberMachineFieldOptions,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    },
  })
}
