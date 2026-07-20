import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import type { UserProfile } from '../lib/authIdentity'

type Mode = 'login' | 'register' | 'approvals'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState<UserProfile[]>([])
  const [approvalsReady, setApprovalsReady] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const loading = useAuthStore((s) => s.loading)
  const profile = useAuthStore((s) => s.profile)
  const session = useAuthStore((s) => s.session)
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const signOut = useAuthStore((s) => s.signOut)
  const listPendingProfiles = useAuthStore((s) => s.listPendingProfiles)
  const setProfileStatus = useAuthStore((s) => s.setProfileStatus)
  const setAuthSkipped = useAppStore((s) => s.setAuthSkipped)
  const setStayOnApprovals = useAppStore((s) => s.setStayOnApprovals)

  const isAdmin = profile?.role === 'admin' && profile.status === 'active' && Boolean(session)

  const loadPending = useCallback(async () => {
    const res = await listPendingProfiles()
    if (res.error) {
      setError(res.error)
      setPending([])
      return
    }
    setPending(res.data)
    setApprovalsReady(true)
  }, [listPendingProfiles])

  useEffect(() => {
    if (mode === 'approvals' && isAdmin) {
      void loadPending()
    }
  }, [mode, isAdmin, loadPending])

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (mode === 'register') {
      const result = await signUp(username, password)
      if (result.error) {
        setError(result.error)
        return
      }
      setInfo(
        'Registrierung gespeichert. Du hast noch keinen Zugang – ein Admin muss dich unter „Freigaben“ aktivieren.',
      )
      setPassword('')
      setMode('login')
      return
    }

    const result = await signIn(username, password)
    if (result.error) {
      setError(result.error)
      return
    }
  }

  async function handleApprovalsLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setStayOnApprovals(true)
    const result = await signIn(username, password)
    if (result.error) {
      setError(result.error)
      return
    }
    const p = useAuthStore.getState().profile
    if (p?.role !== 'admin') {
      setError('Nur Admins dürfen Konten freigeben. Du wirst abgemeldet.')
      setStayOnApprovals(false)
      await signOut()
      return
    }
    setInfo('Admin angemeldet – ausstehende Konten laden…')
    await loadPending()
  }

  async function activate(id: string, status: 'active' | 'rejected') {
    setBusyId(id)
    setError(null)
    const res = await setProfileStatus(id, status)
    setBusyId(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setPending((prev) => prev.filter((p) => p.id !== id))
    setInfo(status === 'active' ? 'Konto aktiviert.' : 'Konto abgelehnt.')
  }

  const inputCls =
    'bg-kwd-surface border-kwd-surface-light mt-1 min-h-[52px] w-full rounded-xl border px-4 text-kwd-text'

  return (
    <div
      className="flex min-h-svh w-full flex-col items-center justify-center p-6"
      style={{ minHeight: '100svh', background: '#0f172a', color: '#f8fafc' }}
    >
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <p className="text-kwd-primary text-sm font-bold tracking-widest uppercase">
            KWD Dresden
          </p>
          <h1 className="mt-2 text-2xl font-bold">Instandhaltung</h1>
          <p className="text-kwd-muted mt-2 text-sm">
            {mode === 'login' && 'Anmelden mit Benutzername'}
            {mode === 'register' && 'Registrieren – Zugang erst nach Freigabe'}
            {mode === 'approvals' && 'Konten freigeben (nur Admin)'}
          </p>
        </header>

        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1 text-xs font-semibold">
          {(
            [
              ['login', 'Anmelden'],
              ['register', 'Registrieren'],
              ['approvals', 'Freigaben'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id)
                setError(null)
                setInfo(null)
                if (id === 'approvals') setStayOnApprovals(true)
                else if (!session) setStayOnApprovals(false)
              }}
              className={`min-h-[40px] rounded-lg px-1 ${
                mode === id ? 'bg-kwd-primary text-white' : 'text-kwd-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {(mode === 'login' || mode === 'register' || (mode === 'approvals' && !isAdmin)) && (
          <form
            onSubmit={mode === 'approvals' ? handleApprovalsLogin : handleAuthSubmit}
            className="flex flex-col gap-4"
          >
            <label>
              <span className="text-kwd-muted text-sm font-medium">Benutzername</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                minLength={3}
                className={inputCls}
              />
            </label>

            <div>
              <span className="text-kwd-muted text-sm font-medium">Persönliches Passwort</span>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className={`${inputCls} mt-0 pr-24`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-kwd-primary absolute top-1/2 right-2 -translate-y-1/2 px-2 text-xs font-bold"
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Verbergen' : 'Anzeigen'}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-kwd-danger bg-kwd-danger/10 rounded-lg px-3 py-2 text-sm">{error}</p>
            )}
            {info && (
              <p className="text-kwd-success bg-kwd-success/10 rounded-lg px-3 py-2 text-sm">{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-kwd-primary text-kwd-bg mt-2 min-h-[56px] rounded-xl text-lg font-bold disabled:opacity-50"
            >
              {loading
                ? 'Bitte warten…'
                : mode === 'register'
                  ? 'Registrieren'
                  : mode === 'approvals'
                    ? 'Als Admin anmelden'
                    : 'Anmelden'}
            </button>
          </form>
        )}

        {mode === 'approvals' && isAdmin && (
          <div className="flex flex-col gap-3">
            {error && (
              <p className="text-kwd-danger bg-kwd-danger/10 rounded-lg px-3 py-2 text-sm">{error}</p>
            )}
            {info && (
              <p className="text-kwd-success bg-kwd-success/10 rounded-lg px-3 py-2 text-sm">{info}</p>
            )}
            <p className="text-kwd-muted text-xs">
              Angemeldet als Admin <strong className="text-kwd-text">{profile?.username}</strong>
            </p>
            {!approvalsReady ? (
              <p className="text-kwd-muted text-sm">Lade Anfragen…</p>
            ) : pending.length === 0 ? (
              <p className="text-kwd-muted rounded-lg bg-black/20 px-3 py-4 text-center text-sm">
                Keine offenen Registrierungen.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pending.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">{p.username}</p>
                      <p className="text-kwd-muted text-xs">
                        {new Date(p.created_at).toLocaleString('de-DE')}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void activate(p.id, 'active')}
                        className="bg-kwd-success min-h-[40px] rounded-lg px-3 text-sm font-bold text-white"
                      >
                        Aktivieren
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void activate(p.id, 'rejected')}
                        className="bg-kwd-danger min-h-[40px] rounded-lg px-3 text-sm font-bold text-white"
                      >
                        Ablehnen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void loadPending()}
              className="text-kwd-primary text-sm font-semibold"
            >
              Liste aktualisieren
            </button>
            <button
              type="button"
              onClick={() => setStayOnApprovals(false)}
              className="bg-kwd-primary min-h-[48px] rounded-xl text-sm font-bold text-white"
            >
              Zur App
            </button>
            <button
              type="button"
              onClick={() => {
                setStayOnApprovals(false)
                void signOut()
              }}
              className="text-kwd-muted text-sm underline"
            >
              Admin abmelden
            </button>
          </div>
        )}

        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => setAuthSkipped(true)}
            className="text-kwd-muted mt-6 w-full text-sm underline"
          >
            Ohne Anmeldung fortfahren (nur Entwicklung)
          </button>
        )}
      </div>
    </div>
  )
}
