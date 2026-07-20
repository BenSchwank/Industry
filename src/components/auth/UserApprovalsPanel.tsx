import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import type { UserProfile } from '../../lib/authIdentity'

/** Freigabe-Liste für Admins (Einstellungen) */
export function UserApprovalsPanel() {
  const profile = useAuthStore((s) => s.profile)
  const listPendingProfiles = useAuthStore((s) => s.listPendingProfiles)
  const setProfileStatus = useAuthStore((s) => s.setProfileStatus)
  const [pending, setPending] = useState<UserProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const isAdmin = profile?.role === 'admin' && profile.status === 'active'

  const load = useCallback(async () => {
    const res = await listPendingProfiles()
    if (res.error) {
      setError(res.error)
      return
    }
    setError(null)
    setPending(res.data)
  }, [listPendingProfiles])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  if (!isAdmin) return null

  async function act(id: string, status: 'active' | 'rejected') {
    setBusyId(id)
    const res = await setProfileStatus(id, status)
    setBusyId(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <section className="kwd-panel md:col-span-2">
      <div className="kwd-panel-head">Benutzer-Freigaben</div>
      <p className="text-kwd-muted border-kwd-border border-b px-4 py-2 text-sm">
        Neue Registrierungen freigeben oder ablehnen. Ohne Aktivierung kein App-Zugang.
      </p>
      <div className="p-4">
        {error && (
          <p className="text-kwd-danger bg-kwd-danger/10 border-kwd-danger mb-3 border px-3 py-2 text-sm">
            {error}
          </p>
        )}
        {pending.length === 0 ? (
          <p className="text-kwd-muted text-sm">Keine offenen Anfragen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="border-kwd-border flex flex-wrap items-center justify-between gap-2 border px-3 py-2"
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
                    className="kwd-btn kwd-btn-primary"
                    disabled={busyId === p.id}
                    onClick={() => void act(p.id, 'active')}
                  >
                    Aktivieren
                  </button>
                  <button
                    type="button"
                    className="kwd-btn kwd-btn-danger"
                    disabled={busyId === p.id}
                    onClick={() => void act(p.id, 'rejected')}
                  >
                    Ablehnen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="kwd-btn mt-3" onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>
    </section>
  )
}
