import { supabase } from './supabase'

/** Löst Benutzer-IDs zu Anzeigenamen (profiles.username) auf. */
export async function resolveUsernames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const map = new Map<string, string>()
  if (unique.length === 0) return map

  const { data, error } = await supabase.from('profiles').select('id, username').in('id', unique)
  if (error || !data) return map
  for (const row of data) {
    if (row.username) map.set(row.id, row.username)
  }
  return map
}
