/** Interne Auth-E-Mail aus Benutzername (Supabase braucht eine gültige E-Mail-Syntax). */
export const KWD_AUTH_DOMAIN = 'kwd-auth.example.com'

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
}

export function usernameToEmail(username: string): string {
  const u = normalizeUsername(username)
  if (!u) throw new Error('Benutzername fehlt')
  return `${u}@${KWD_AUTH_DOMAIN}`
}

export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw)
  if (u.length < 3) return 'Benutzername mindestens 3 Zeichen'
  if (u.length > 32) return 'Benutzername maximal 32 Zeichen'
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(u)) {
    return 'Nur Buchstaben, Zahlen, Punkt, Bindestrich, Unterstrich'
  }
  return null
}

export type ProfileStatus = 'pending' | 'active' | 'rejected'
export type ProfileRole = 'user' | 'admin'

export interface UserProfile {
  id: string
  username: string
  role: ProfileRole
  status: ProfileStatus
  created_at: string
  activated_at: string | null
  activated_by: string | null
}
