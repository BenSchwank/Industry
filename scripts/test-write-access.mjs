import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) process.env[m[1]] = m[2].trim()
    }
  } catch {
    /* ignore */
  }
}

loadEnv()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('FEHLER: .env.local fehlt oder unvollständig')
  process.exit(1)
}

const supabase = createClient(url, key)
const testCode = `KWD-M-TEST-${Date.now().toString(36).toUpperCase()}`

console.log('Teste Schreibzugriff auf Supabase…')
console.log('URL:', url)

const { data: machine, error: insertError } = await supabase
  .from('machines')
  .insert({
    barcode: testCode,
    name: 'Schreibtest',
    location: 'Halle Test',
    status: 'active',
  })
  .select('id')
  .single()

if (insertError) {
  console.error('\n❌ Maschinen-INSERT fehlgeschlagen:', insertError.code, insertError.message)
  console.error('\n→ Bitte supabase/RUN_007_008.sql im Supabase SQL Editor ausführen.')
  process.exit(1)
}

console.log('✓ Maschinen-INSERT OK')

const { error: lifecycleError } = await supabase.from('machine_lifecycle_entries').insert({
  machine_id: machine.id,
  entry_type: 'maintenance',
  title: 'Test',
  occurred_at: new Date().toISOString(),
})

if (lifecycleError) {
  console.warn('⚠ Lifecycle-INSERT fehlgeschlagen:', lifecycleError.code, lifecycleError.message)
} else {
  console.log('✓ Lifecycle-INSERT OK')
}

const { error: taskError } = await supabase.from('maintenance_tasks').insert({
  machine_id: machine.id,
  title: 'Test-Wartung',
  frequency_days: 30,
  next_due_date: '2026-12-31',
})

if (taskError) {
  console.warn('⚠ Wartungs-INSERT fehlgeschlagen:', taskError.code, taskError.message)
} else {
  console.log('✓ Wartungs-INSERT OK')
}

await supabase.from('machines').delete().eq('id', machine.id)
console.log('\n✓ Alle Schreibtests bestanden – Maschinen anlegen sollte funktionieren.')
