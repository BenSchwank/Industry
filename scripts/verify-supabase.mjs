import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('FEHLER: VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt.')
  process.exit(1)
}

const supabase = createClient(url, key)

const { error } = await supabase.from('machines').select('id').limit(1)

if (error) {
  if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
    console.log('OK: Supabase erreichbar – Tabellen fehlen noch (Teil C ausführen).')
    process.exit(0)
  }
  console.error('FEHLER:', error.message)
  process.exit(1)
}

console.log('OK: Supabase verbunden – Tabellen existieren bereits.')
process.exit(0)
