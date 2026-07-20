import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import type { UserProfile } from '../lib/authIdentity'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Wartend',
  active: 'Aktiv',
  rejected: 'Abgelehnt',
}

export default function UsersAdminPage() {
  const profile = useAuthStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)
  const listAllProfiles = useAuthStore((s) => s.listAllProfiles)
  const setProfileStatus = useAuthStore((s) => s.setProfileStatus)
  const setProfileRole = useAuthStore((s) => s.setProfileRole)
  const setActiveView = useAppStore((s) => s.setActiveView)

  const [rows, setRows] = useState<UserProfile[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'admin'>('all')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const isAdmin = profile?.role === 'admin' && profile.status === 'active'

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listAllProfiles()
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setError(null)
    setRows(res.data)
  }, [listAllProfiles])

  useEffect(() => {
    if (!isAdmin) {
      setActiveView('overview')
      return
    }
    void load()
  }, [isAdmin, load, setActiveView])

  const filtered = useMemo(() => {
    if (filter === 'pending') return rows.filter((r) => r.status === 'pending')
    if (filter === 'active') return rows.filter((r) => r.status === 'active')
    if (filter === 'admin') return rows.filter((r) => r.role === 'admin')
    return rows
  }, [rows, filter])

  async function run(
    id: string,
    action: () => Promise<{ error: string | null }>,
    okMsg: string,
  ) {
    setBusyId(id)
    setError(null)
    setInfo(null)
    const res = await action()
    setBusyId(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setInfo(okMsg)
    await load()
  }

  if (!isAdmin) {
    return (
      <p className="text-kwd-muted p-6 text-sm">Nur für Admins.</p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 lg:px-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Nutzerverwaltung</h2>
        <p className="text-kwd-muted mt-1 text-sm">
          Konten freigeben und Admins ernennen. Admins können ebenfalls Freigaben erteilen.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'Alle'],
            ['pending', 'Wartend'],
            ['active', 'Aktiv'],
            ['admin', 'Admins'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`kwd-btn ${filter === id ? 'kwd-btn-primary' : ''}`}
          >
            {label}
            {id === 'pending' && (
              <span className="ml-1 tabular-nums">
                ({rows.filter((r) => r.status === 'pending').length})
              </span>
            )}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="kwd-btn ml-auto">
          Aktualisieren
        </button>
      </div>

      {error && (
        <p className="text-kwd-danger bg-kwd-danger/10 border-kwd-danger border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {info && (
        <p className="text-kwd-success bg-kwd-success/10 border-kwd-success/30 border px-3 py-2 text-sm">
          {info}
        </p>
      )}

      <section className="kwd-panel overflow-hidden">
        <div className="kwd-panel-head">
          Nutzer ({filtered.length}
          {loading ? ' …' : ''})
        </div>
        {filtered.length === 0 && !loading ? (
          <p className="text-kwd-muted px-4 py-8 text-center text-sm">Keine Einträge.</p>
        ) : (
          <ul className="divide-kwd-border divide-y">
            {filtered.map((p) => {
              const isSelf = p.id === user?.id
              const busy = busyId === p.id
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {p.username}
                      {isSelf && (
                        <span className="text-kwd-muted ml-2 text-xs font-normal">(du)</span>
                      )}
                    </p>
                    <p className="text-kwd-muted text-xs">
                      {STATUS_LABEL[p.status] ?? p.status}
                      {' · '}
                      {p.role === 'admin' ? 'Admin' : 'Nutzer'}
                      {' · '}
                      {new Date(p.created_at).toLocaleString('de-DE')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          className="kwd-btn kwd-btn-primary text-xs"
                          onClick={() =>
                            void run(
                              p.id,
                              () => setProfileStatus(p.id, 'active'),
                              `${p.username} freigegeben`,
                            )
                          }
                        >
                          Freigeben
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="kwd-btn kwd-btn-danger text-xs"
                          onClick={() =>
                            void run(
                              p.id,
                              () => setProfileStatus(p.id, 'rejected'),
                              `${p.username} abgelehnt`,
                            )
                          }
                        >
                          Ablehnen
                        </button>
                      </>
                    )}
                    {p.status === 'rejected' && (
                      <button
                        type="button"
                        disabled={busy}
                        className="kwd-btn text-xs"
                        onClick={() =>
                          void run(
                            p.id,
                            () => setProfileStatus(p.id, 'active'),
                            `${p.username} wieder aktiv`,
                          )
                        }
                      >
                        Reaktivieren
                      </button>
                    )}
                    {p.status === 'active' && p.role !== 'admin' && (
                      <button
                        type="button"
                        disabled={busy}
                        className="kwd-btn kwd-btn-danger text-xs"
                        onClick={() =>
                          void run(
                            p.id,
                            () => setProfileStatus(p.id, 'rejected'),
                            `${p.username} gesperrt`,
                          )
                        }
                      >
                        Sperren
                      </button>
                    )}
                    {p.role !== 'admin' ? (
                      <button
                        type="button"
                        disabled={busy || p.status === 'rejected'}
                        className="kwd-btn kwd-btn-primary text-xs"
                        title="Darf danach Freigaben erteilen"
                        onClick={() =>
                          void run(
                            p.id,
                            () => setProfileRole(p.id, 'admin'),
                            `${p.username} ist jetzt Admin`,
                          )
                        }
                      >
                        Zum Admin machen
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        className="kwd-btn text-xs"
                        title={isSelf ? 'Eigenes Admin-Recht hier nicht entfernen' : undefined}
                        onClick={() =>
                          void run(
                            p.id,
                            () => setProfileRole(p.id, 'user'),
                            `${p.username} ist nur noch Nutzer`,
                          )
                        }
                      >
                        Admin entfernen
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
