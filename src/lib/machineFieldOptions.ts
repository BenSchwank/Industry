import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { machineCategorySuggestions } from './machineCategories'
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

export async function rememberMachineFieldOptions(input: {
  category?: string | null
  location?: string | null
}): Promise<void> {
  await Promise.all([
    rememberMachineFieldOption('category', input.category),
    rememberMachineFieldOption('location', input.location),
  ])
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
