import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'

export interface ChatColleague {
  id: string
  username: string
}

/** Aktive Kollegen für Team-Chat (inkl. Admins, ohne sich selbst). */
export async function listChatColleagues(): Promise<ChatColleague[]> {
  const selfId = useAuthStore.getState().user?.id
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('status', 'active')
    .order('username')

  if (error) return []
  return (data ?? [])
    .filter((p) => p.id !== selfId)
    .map((p) => ({ id: p.id, username: p.username }))
}
