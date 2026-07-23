import { supabase } from './supabase'

export interface ActiveAssignee {
  id: string
  username: string
}

/** Aktive Benutzer für die Zuständigen-Auswahl bei Störungen. */
export async function listActiveAssignees(): Promise<ActiveAssignee[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('status', 'active')
    .order('username')

  if (error) {
    // Fallback: nur eigenes Profil (ältere RLS ohne „Auth read active profiles“)
    const { data: own, error: ownErr } = await supabase
      .from('profiles')
      .select('id, username')
      .limit(1)
    if (ownErr || !own?.length) return []
    return own as ActiveAssignee[]
  }

  return (data ?? []) as ActiveAssignee[]
}
