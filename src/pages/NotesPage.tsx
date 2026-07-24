import { useEffect, useMemo, useRef, useState } from 'react'
import { Tip } from '../components/ui/Tip'
import {
  NOTES_SQL_HINT,
  useCreateUserNote,
  useDeleteUserNote,
  useUpdateUserNote,
  useUserNotes,
  type UserNote,
} from '../hooks/useNotes'
import { useNotePhotos } from '../hooks/useNotePhotos'
import { NotePhotoPicker, NotePhotoStrip } from '../components/machines/LifecyclePhotos'
import { resolveUsernames } from '../lib/resolveUsernames'
import { useAuthStore } from '../stores/authStore'
import { useQuery } from '@tanstack/react-query'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function previewBody(body: string) {
  const line = body.replace(/\s+/g, ' ').trim()
  if (!line) return 'Leer'
  return line.length > 72 ? `${line.slice(0, 72)}…` : line
}

export default function NotesPage() {
  const userId = useAuthStore((s) => s.user?.id)
  const { data: notes = [], isLoading, error, refetch } = useUserNotes()
  const createNote = useCreateUserNote()
  const updateNote = useUpdateUserNote()
  const deleteNote = useDeleteUserNote()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [actionError, setActionError] = useState<string | null>(null)
  const [mobileListOpen, setMobileListOpen] = useState(true)
  const ensuringRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const titleTimerRef = useRef<number | null>(null)
  const lastLoadedId = useRef<string | null>(null)

  const ownNotes = useMemo(
    () => notes.filter((n) => n.owner_id === userId),
    [notes, userId],
  )
  const sharedNotes = useMemo(
    () => notes.filter((n) => n.owner_id !== userId && n.is_public),
    [notes, userId],
  )

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  )
  const isOwner = Boolean(selected && userId && selected.owner_id === userId)
  const { data: notePhotos = [], refetch: refetchPhotos } = useNotePhotos(selectedId)

  const ownerIds = useMemo(
    () => [...new Set(sharedNotes.map((n) => n.owner_id))],
    [sharedNotes],
  )
  const { data: ownerNames = new Map<string, string>() } = useQuery({
    queryKey: ['note-owner-names', ownerIds.join(',')],
    enabled: ownerIds.length > 0,
    queryFn: () => resolveUsernames(ownerIds),
    staleTime: 60_000,
  })

  const createNoteMutate = createNote.mutateAsync
  const ownNotesLen = ownNotes.length

  // Immer mindestens eine eigene Notiz bereithalten
  useEffect(() => {
    if (!userId || isLoading || error || ensuringRef.current) return
    if (ownNotesLen > 0) {
      if (!selectedId || !notes.some((n) => n.id === selectedId)) {
        setSelectedId(ownNotes[0].id)
        setMobileListOpen(false)
      }
      return
    }
    ensuringRef.current = true
    void createNoteMutate({ title: 'Neue Notiz', body: '' })
      .then((row) => {
        setSelectedId(row.id)
        setMobileListOpen(false)
      })
      .catch((err: Error) => {
        setActionError(err.message)
        ensuringRef.current = false
      })
  }, [userId, isLoading, error, ownNotesLen, ownNotes, selectedId, notes, createNoteMutate])

  // Editor-Inhalt synchronisieren, wenn Auswahl wechselt
  useEffect(() => {
    if (!selected) return
    if (lastLoadedId.current === selected.id) return
    lastLoadedId.current = selected.id
    setTitleDraft(selected.title)
    setBodyDraft(selected.body)
    setSaveState('idle')
    setActionError(null)
  }, [selected])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current)
    }
  }, [])

  function queueBodySave(nextBody: string) {
    if (!selected || !isOwner) return
    setSaveState('saving')
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void updateNote
        .mutateAsync({ id: selected.id, body: nextBody })
        .then(() => setSaveState('saved'))
        .catch((err: Error) => {
          setSaveState('error')
          setActionError(err.message)
        })
    }, 450)
  }

  function queueTitleSave(nextTitle: string) {
    if (!selected || !isOwner) return
    setSaveState('saving')
    if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current)
    titleTimerRef.current = window.setTimeout(() => {
      void updateNote
        .mutateAsync({ id: selected.id, title: nextTitle })
        .then(() => setSaveState('saved'))
        .catch((err: Error) => {
          setSaveState('error')
          setActionError(err.message)
        })
    }, 350)
  }

  async function handleNewNote() {
    setActionError(null)
    try {
      const row = await createNote.mutateAsync({ title: 'Neue Notiz', body: '' })
      lastLoadedId.current = null
      setSelectedId(row.id)
      setMobileListOpen(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen')
    }
  }

  async function handleTogglePublic() {
    if (!selected || !isOwner) return
    setActionError(null)
    try {
      await updateNote.mutateAsync({ id: selected.id, is_public: !selected.is_public })
      setSaveState('saved')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Teilen fehlgeschlagen')
    }
  }

  async function handleDelete() {
    if (!selected || !isOwner) return
    if (
      !window.confirm(
        `Notiz „${selected.title.trim() || 'Neue Notiz'}“ löschen? Das lässt sich nicht rückgängig machen.`,
      )
    ) {
      return
    }
    setActionError(null)
    const deletingId = selected.id
    try {
      await deleteNote.mutateAsync(deletingId)
      lastLoadedId.current = null
      const remaining = ownNotes.filter((n) => n.id !== deletingId)
      if (remaining[0]) {
        setSelectedId(remaining[0].id)
      } else {
        setSelectedId(null)
        ensuringRef.current = false
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    }
  }

  const schemaError =
    error instanceof Error && error.message.includes('FIX_USER_NOTES')
      ? error.message
      : actionError?.includes('FIX_USER_NOTES')
        ? actionError
        : null

  function NoteListItem({
    note,
    subtitle,
  }: {
    note: UserNote
    subtitle?: string
  }) {
    const active = note.id === selectedId
    return (
      <button
        type="button"
        onClick={() => {
          lastLoadedId.current = null
          setSelectedId(note.id)
          setMobileListOpen(false)
        }}
        className={`hover:bg-kwd-surface-light flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
          active ? 'bg-kwd-primary/15' : ''
        }`}
      >
        <span className="flex items-center gap-2 truncate text-sm font-semibold">
          <span className="min-w-0 truncate">{note.title.trim() || 'Neue Notiz'}</span>
          {note.is_public && (
            <span className="text-kwd-primary shrink-0 text-[10px] font-bold tracking-wide uppercase">
              Öffentlich
            </span>
          )}
        </span>
        <span className="text-kwd-muted truncate text-[11px]">{previewBody(note.body)}</span>
        {subtitle && <span className="text-kwd-muted text-[10px]">{subtitle}</span>}
      </button>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Notizen</h2>
          <Tip>
            <p className="text-kwd-muted text-sm">
              Persönlicher Notizblock – privat nur für dich, oder mit einem Klick öffentlich für alle.
            </p>
          </Tip>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="kwd-btn lg:hidden"
            onClick={() => setMobileListOpen((o) => !o)}
          >
            {mobileListOpen ? 'Editor' : 'Liste'}
          </button>
          <button
            type="button"
            className="kwd-btn kwd-btn-primary"
            onClick={() => void handleNewNote()}
            disabled={!userId || createNote.isPending || Boolean(schemaError)}
          >
            + Neue Notiz
          </button>
        </div>
      </header>

      {schemaError && (
        <div className="border-kwd-warning/40 bg-kwd-warning/10 text-kwd-text border px-3 py-2 text-sm">
          <p className="font-semibold">Datenbank noch nicht bereit</p>
          <p className="text-kwd-muted mt-1 text-xs">{NOTES_SQL_HINT}</p>
          <button type="button" className="kwd-btn mt-2 text-xs" onClick={() => void refetch()}>
            Erneut laden
          </button>
        </div>
      )}

      {!userId && (
        <p className="text-kwd-muted text-sm">Bitte anmelden, um Notizen zu speichern.</p>
      )}

      <div className="kwd-panel flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside
          className={`border-kwd-border flex w-full shrink-0 flex-col border-b lg:w-72 lg:border-r lg:border-b-0 ${
            mobileListOpen ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="kwd-panel-head">Meine Notizen ({ownNotes.length})</div>
          <div className="max-h-[40vh] overflow-auto lg:max-h-none lg:flex-1">
            {isLoading && <p className="text-kwd-muted px-3 py-4 text-xs">Laden…</p>}
            {!isLoading &&
              ownNotes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  subtitle={formatWhen(note.updated_at)}
                />
              ))}
          </div>

          {sharedNotes.length > 0 && (
            <>
              <div className="kwd-panel-head border-kwd-border border-t">
                Geteilt von anderen ({sharedNotes.length})
              </div>
              <div className="max-h-[30vh] overflow-auto lg:max-h-none">
                {sharedNotes.map((note) => (
                  <NoteListItem
                    key={note.id}
                    note={note}
                    subtitle={`${ownerNames.get(note.owner_id) ?? 'Kollege'} · ${formatWhen(note.updated_at)}`}
                  />
                ))}
              </div>
            </>
          )}
        </aside>

        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${
            mobileListOpen ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {!selected && !isLoading && (
            <p className="text-kwd-muted px-4 py-10 text-center text-sm">
              Keine Notiz ausgewählt – lege eine neue an.
            </p>
          )}

          {selected && (
            <>
              <div className="border-kwd-border flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <input
                  value={titleDraft}
                  onChange={(e) => {
                    const next = e.target.value
                    setTitleDraft(next)
                    queueTitleSave(next)
                  }}
                  disabled={!isOwner}
                  placeholder="Titel…"
                  className="border-kwd-border bg-kwd-paper min-h-[36px] min-w-[10rem] flex-1 border px-2 text-sm font-semibold"
                  aria-label="Notiz umbenennen"
                  title="Titel tippen – wird automatisch gespeichert"
                />
                {isOwner && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleTogglePublic()}
                      disabled={updateNote.isPending}
                      className={`kwd-btn shrink-0 text-xs ${
                        selected.is_public ? 'kwd-btn-primary' : ''
                      }`}
                      title={
                        selected.is_public
                          ? 'Öffentlich – alle Nutzer können lesen. Klick → privat'
                          : 'Privat – nur du. Klick → öffentlich teilen'
                      }
                    >
                      {selected.is_public ? 'Öffentlich' : 'Privat'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleteNote.isPending}
                      className="kwd-btn kwd-btn-danger shrink-0 text-xs"
                    >
                      Löschen
                    </button>
                  </>
                )}
                {!isOwner && (
                  <span className="text-kwd-muted text-xs">
                    Geteilt · nur lesen · {ownerNames.get(selected.owner_id) ?? 'Kollege'}
                  </span>
                )}
                <span className="text-kwd-muted ml-auto text-[11px] tabular-nums">
                  {saveState === 'saving' && 'Speichern…'}
                  {saveState === 'saved' && 'Gespeichert'}
                  {saveState === 'error' && 'Fehler beim Speichern'}
                  {saveState === 'idle' && formatWhen(selected.updated_at)}
                </span>
              </div>

              <textarea
                value={bodyDraft}
                onChange={(e) => {
                  const next = e.target.value
                  setBodyDraft(next)
                  queueBodySave(next)
                }}
                disabled={!isOwner}
                placeholder={
                  isOwner
                    ? 'Hier schreiben… (wird automatisch gespeichert)'
                    : 'Nur Lesezugriff – diese Notiz gehört einem Kollegen.'
                }
                className="border-kwd-border bg-kwd-paper text-kwd-text min-h-[220px] w-full flex-1 resize-none border-0 px-4 py-3 text-sm leading-relaxed focus:outline-none disabled:opacity-80"
                aria-label="Notiztext"
              />

              <div className="border-kwd-border border-t px-4 py-3">
                <p className="text-kwd-muted mb-1 text-[11px] font-semibold tracking-wide uppercase">
                  Fotos
                </p>
                {notePhotos.length > 0 ? (
                  <NotePhotoStrip photos={notePhotos} canDelete={isOwner} size="lg" />
                ) : (
                  <p className="text-kwd-muted text-xs">Noch keine Fotos.</p>
                )}
                {isOwner && (
                  <NotePhotoPicker
                    noteId={selected.id}
                    onUploaded={() => void refetchPhotos()}
                  />
                )}
              </div>

              {actionError && !schemaError && (
                <p className="text-kwd-danger border-kwd-border border-t px-3 py-2 text-xs">
                  {actionError}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
