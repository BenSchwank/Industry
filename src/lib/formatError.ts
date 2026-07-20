import type { PostgrestError } from '@supabase/supabase-js'

export function formatSupabaseError(error: PostgrestError | Error | unknown): string {
  if (!error) return 'Unbekannter Fehler'

  if (error instanceof Error && !('code' in error)) {
    return error.message
  }

  const pg = error as PostgrestError
  if (pg.code === '42501' || pg.message?.includes('permission') || pg.message?.includes('policy')) {
    return 'Keine Schreibberechtigung. Bitte supabase/RUN_007_008.sql im Supabase SQL Editor ausführen (siehe roter Hinweis oben).'
  }
  if (pg.code === '23505') {
    return 'Dieser Code ist bereits vergeben.'
  }
  return pg.message || 'Speichern fehlgeschlagen'
}
