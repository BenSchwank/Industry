/**
 * Smoke-Test: Schreibpfade gegen Supabase (mit Login aus "admin login").
 * Nutzung: node scripts/smoke-writes.cjs
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const env = fs.readFileSync('.env.local', 'utf8')
function get(k) {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

function readAdminLogin() {
  const p = path.join(process.cwd(), 'admin login')
  if (!fs.existsSync(p)) throw new Error('Datei "admin login" fehlt')
  const t = fs.readFileSync(p, 'utf8')
  const user = t.match(/Benutzername\s*\r?\n([^\r\n]+)/)?.[1]?.trim()
  const pass = t.match(/Passwort\s*\r?\n([^\r\n]+)/)?.[1]?.trim()
  const email = t.match(/Interne E-Mail[^\r\n]*\r?\n([^\r\n]+)/)?.[1]?.trim()
  if (!email || !pass) throw new Error('admin login: E-Mail/Passwort nicht gefunden')
  return { email, password: pass, username: user }
}

const url = get('VITE_SUPABASE_URL')
const key = get('VITE_SUPABASE_ANON_KEY')
const sb = createClient(url, key)
const creds = readAdminLogin()

const results = []

function ok(name, detail) {
  results.push({ name, ok: true, detail })
  console.log('OK  ', name, detail || '')
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.log('FAIL', name, detail)
}

async function insertTicketResilient(machineId, userId) {
  const base = {
    machine_id: machineId,
    description: 'SMOKE ticket resilient ' + Date.now(),
    priority: 'low',
    status: 'open',
  }
  const withAuthor = { ...base, created_by: userId }
  let r = await sb.from('tickets').insert(withAuthor).select('id').single()
  if (!r.error) return { ...r, usedCreatedBy: true }
  if (/created_by/i.test(r.error.message)) {
    r = await sb.from('tickets').insert(base).select('id').single()
    return { ...r, usedCreatedBy: false }
  }
  return { ...r, usedCreatedBy: null }
}

async function main() {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  })
  if (authErr) {
    fail('auth login', authErr.message)
    process.exit(1)
  }
  const {
    data: { user },
  } = await sb.auth.getUser()
  ok('auth login', user?.email)

  const { data: machines, error: mErr } = await sb.from('machines').select('id, name').limit(1)
  if (mErr || !machines?.[0]) {
    fail('machines read', mErr?.message || 'keine Maschine')
    process.exit(1)
  }
  const machineId = machines[0].id
  ok('machines read', machines[0].name)

  {
    const r = await insertTicketResilient(machineId, user.id)
    if (!r.error) {
      ok(
        'ticket insert (app fallback)',
        `${r.data.id}${r.usedCreatedBy ? ' +created_by' : ' ohne created_by'}`,
      )
      await sb.from('tickets').delete().eq('id', r.data.id)
      if (!r.usedCreatedBy) {
        fail('ticket created_by column', 'Bitte FIX_ALL_PENDING.sql in Supabase ausführen')
      }
    } else fail('ticket insert', r.error.message)
  }

  {
    const r1 = await sb
      .from('machine_lifecycle_entries')
      .insert({
        machine_id: machineId,
        entry_type: 'note',
        title: 'SMOKE duration test',
        created_by: user.id,
        duration_days: 90,
        next_due_date: '2030-01-01',
      })
      .select('id')
      .single()
    if (!r1.error) {
      ok('lifecycle insert (+duration+created_by)', r1.data.id)
      await sb.from('machine_lifecycle_entries').delete().eq('id', r1.data.id)
    } else if (/created_by/i.test(r1.error.message)) {
      const r2 = await sb
        .from('machine_lifecycle_entries')
        .insert({
          machine_id: machineId,
          entry_type: 'note',
          title: 'SMOKE duration no author',
          duration_days: 90,
          next_due_date: '2030-01-01',
        })
        .select('id')
        .single()
      if (!r2.error) {
        ok('lifecycle insert (+duration, ohne created_by)', r2.data.id)
        await sb.from('machine_lifecycle_entries').delete().eq('id', r2.data.id)
        fail('lifecycle created_by column', 'FIX_ALL_PENDING.sql nötig für Autor-Anzeige')
      } else fail('lifecycle insert', r2.error.message)
    } else fail('lifecycle insert', r1.error.message)
  }

  const failed = results.filter((r) => !r.ok)
  console.log('\nSummary:', results.length - failed.length, 'ok,', failed.length, 'fail')
  if (failed.some((r) => r.name.includes('insert') && !r.name.includes('column'))) {
    process.exit(1)
  }
  if (failed.length) {
    console.log('Hinweis: Spalten-Migrationen fehlen – App-Fallback speichert trotzdem.')
    process.exit(2)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
