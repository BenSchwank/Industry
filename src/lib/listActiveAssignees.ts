import { supabase } from './supabase'

export interface ActiveAssignee {
  id: string
  username: string
}

/** Aktive Nicht-Admin-Benutzer für die Zuständigen-Auswahl bei Störungen. */
export async function listActiveAssignees(): Promise<ActiveAssignee[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('status', 'active')
    .order('username')

  if (error) {
    // Fallback: nur eigenes Profil (ältere RLS ohne „Auth read active profiles“)
    const { data: own, error: ownErr } = await supabase
      .from('profiles')
      .select('id, username, role')
      .limit(1)
    if (ownErr || !own?.length) return []
    return own
      .filter((p) => p.role !== 'admin')
      .map((p) => ({ id: p.id, username: p.username })) as ActiveAssignee[]
  }

  // Admins gehören nicht in die Monteur-/Zuständigen-Auswahl
  return (data ?? [])
    .filter((p) => p.role !== 'admin')
    .map((p) => ({ id: p.id, username: p.username })) as ActiveAssignee[]
}
