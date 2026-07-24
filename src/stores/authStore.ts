import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import {
  normalizeUsername,
  usernameToEmail,
  validateUsername,
  type UserProfile,
} from '../lib/authIdentity'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'

function mapAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) {
    return 'Zu viele Registrierungen gerade (Supabase-Limit, oft nur 2/Stunde). Bitte ~1 Stunde warten ODER Nutzer im Dashboard anlegen: Authentication → Users → Add user.'
  }
  if (m.includes('invalid login credentials')) {
    return 'Benutzername oder Passwort falsch – oder der Account existiert noch nicht.'
  }
  if (m.includes('user already registered')) {
    return 'Dieser Benutzername ist bereits registriert – bitte anmelden.'
  }
  return message
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  initialized: boolean
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: (initialized: boolean) => void
  refreshProfile: () => Promise<UserProfile | null>
  /** Session nur behalten, wenn Profil aktiv – sonst abmelden */
  applySessionGate: (session: Session | null) => Promise<{
    ok: boolean
    reason?: string
    profile?: UserProfile | null
  }>
  signIn: (username: string, password: string) => Promise<{ error: string | null }>
  signUp: (username: string, password: string) => Promise<{ error: string | null; pending?: boolean }>
  signOut: () => Promise<void>
  listPendingProfiles: () => Promise<{ data: UserProfile[]; error: string | null }>
  listAllProfiles: () => Promise<{ data: UserProfile[]; error: string | null }>
  setProfileStatus: (
    targetId: string,
    status: 'active' | 'rejected' | 'pending',
  ) => Promise<{ error: string | null }>
  setProfileRole: (targetId: string, role: 'user' | 'admin') => Promise<{ error: string | null }>
  deleteUserAccount: (targetId: string) => Promise<{ error: string | null }>
}

async function fetchOwnProfile(userId?: string | null): Promise<UserProfile | null> {
  const id = userId ?? (await supabase.auth.getUser()).data.user?.id
  if (!id) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role, status, created_at, activated_at, activated_by')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01' || /does not exist|relation/i.test(error.message)) {
      return null
    }
    console.warn('Profil laden:', error.message)
    return null
  }
  return data as UserProfile | null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: false,
  initialized: false,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),

  refreshProfile: async () => {
    const profile = await fetchOwnProfile(get().user?.id)
    set({ profile })
    return profile
  },

  applySessionGate: async (session) => {
    if (!session) {
      set({ session: null, user: null, profile: null })
      return { ok: false, reason: 'not_signed_in', profile: null }
    }

    set({ session, user: session.user })
    const profile = await fetchOwnProfile(session.user.id)

    // Migration noch nicht da → Session erlauben (Übergangsphase)
    if (profile === null) {
      set({ profile: null })
      return { ok: true, profile: null }
    }

    if (profile.status !== 'active') {
      await supabase.auth.signOut()
      set({ session: null, user: null, profile })
      const reason =
        profile.status === 'rejected'
          ? 'Konto abgelehnt. Bitte IT / Admin kontaktieren.'
          : 'Konto wartet auf Freigabe durch einen Admin.'
      return { ok: false, reason, profile }
    }

    set({ profile })
    return { ok: true, profile }
  },

  signIn: async (username, password) => {
    const unameErr = validateUsername(username)
    if (unameErr) return { error: unameErr }

    set({ loading: true })
    try {
      const email = usernameToEmail(username)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: mapAuthError(error.message) }

      const gate = await get().applySessionGate(data.session)
      if (!gate.ok) return { error: gate.reason ?? 'Kein Zugang' }
      return { error: null }
    } finally {
      set({ loading: false })
    }
  },

  signUp: async (username, password) => {
    const unameErr = validateUsername(username)
    if (unameErr) return { error: unameErr }
    if (password.length < 6) return { error: 'Passwort mindestens 6 Zeichen' }

    set({ loading: true })
    try {
      const uname = normalizeUsername(username)
      const email = usernameToEmail(uname)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: uname } },
      })
      if (error) return { error: mapAuthError(error.message) }

      // Nie eingeloggt lassen, solange pending
      if (data.session) {
        await supabase.auth.signOut()
      }
      set({ session: null, user: null, profile: null })
      return {
        error: null,
        pending: true,
      }
    } finally {
      set({ loading: false })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null })
  },

  listPendingProfiles: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, role, status, created_at, activated_at, activated_by')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) return { data: [], error: formatSupabaseError(error) }
    return { data: (data ?? []) as UserProfile[], error: null }
  },

  listAllProfiles: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, role, status, created_at, activated_at, activated_by')
      .order('created_at', { ascending: false })

    if (error) return { data: [], error: formatSupabaseError(error) }
    return { data: (data ?? []) as UserProfile[], error: null }
  },

  setProfileStatus: async (targetId, status) => {
    const { error } = await supabase.rpc('set_profile_status', {
      target_id: targetId,
      new_status: status,
    })
    if (error) return { error: formatSupabaseError(error) }
    return { error: null }
  },

  setProfileRole: async (targetId, role) => {
    const { error } = await supabase.rpc('set_profile_role', {
      target_id: targetId,
      new_role: role,
    })
    if (error) return { error: formatSupabaseError(error) }
    if (get().user?.id === targetId) {
      await get().refreshProfile()
    }
    return { error: null }
  },

  deleteUserAccount: async (targetId) => {
    if (get().user?.id === targetId) {
      return { error: 'Eigenes Konto kann nicht gelöscht werden' }
    }
    const { error } = await supabase.rpc('delete_user_account', {
      target_id: targetId,
    })
    if (error) {
      if (/function.*delete_user_account|schema cache|does not exist/i.test(error.message)) {
        return {
          error:
            'Löschen fehlt in der Datenbank. Bitte supabase/FIX_DELETE_USER.sql in Supabase ausführen.',
        }
      }
      return { error: formatSupabaseError(error) }
    }
    return { error: null }
  },
}))
