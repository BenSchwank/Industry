import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { LoadingFallback } from '../ui/LoadingFallback'
import {
  MACHINE_KNOWLEDGE_SQL_HINT,
  clearLegacyKnowledge,
  readLegacyKnowledge,
  useCreateKnowledgePage,
  useDeleteKnowledgePage,
  useMachineKnowledgePages,
  useUpdateKnowledgePage,
  type MachineKnowledgePage,
} from '../../hooks/useMachineKnowledge'

const BarcodeLabel = lazy(() =>
  import('../barcode/BarcodeLabel').then((m) => ({ default: m.BarcodeLabel })),
)

interface MachineKnowledgePanelProps {
  machineId: string
  machineName: string
  barcode: string
  location?: string | null
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function preview(body: string) {
  const line = body.replace(/\s+/g, ' ').trim()
  if (!line) return 'Leer'
  return line.length > 60 ? `${line.slice(0, 60)}…` : line
}

/**
 * Maschinenwissen: mehrere Dokument-Seiten in der Cloud.
 * Speichert auf dem Server – funktioniert auch im Vollbild und auf anderen Geräten.
 */
export function MachineKnowledgePanel({
  machineId,
  machineName,
  barcode,
  location,
}: MachineKnowledgePanelProps) {
  const { data: pages = [], isLoading, error, refetch } = useMachineKnowledgePages(machineId)
  const createPage = useCreateKnowledgePage()
  const updatePage = useUpdateKnowledgePage()
  const deletePage = useDeleteKnowledgePage()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [actionError, setActionError] = useState<string | null>(null)
  const ensuringRef = useRef(false)
  const migratedRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const titleTimerRef = useRef<number | null>(null)
  const lastLoadedId = useRef<string | null>(null)
  const draftRef = useRef({
    id: null as string | null,
    machineId,
    title: '',
    body: '',
    baselineTitle: '',
    baselineBody: '',
  })
  const updateMutateRef = useRef(updatePage.mutateAsync)
  updateMutateRef.current = updatePage.mutateAsync

  const selected = useMemo(
    () => pages.find((p) => p.id === selectedId) ?? null,
    [pages, selectedId],
  )

  const createMutate = createPage.mutateAsync

  draftRef.current = {
    id: selected?.id ?? null,
    machineId,
    title: titleDraft,
    body: bodyDraft,
    baselineTitle: selected?.title ?? '',
    baselineBody: selected?.body ?? '',
  }

  function flushPendingSave() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (titleTimerRef.current) {
      window.clearTimeout(titleTimerRef.current)
      titleTimerRef.current = null
    }
    const d = draftRef.current
    if (!d.id) return
    if (d.title === d.baselineTitle && d.body === d.baselineBody) return
    // Sofort speichern – auch beim Schließen / Tab-Wechsel / Vollbild verlassen
    void updateMutateRef.current({
      id: d.id,
      machineId: d.machineId,
      title: d.title,
      body: d.body,
    })
  }

  // Mindestens eine Seite; Legacy-localStorage einmalig übernehmen
  useEffect(() => {
    if (isLoading || error || ensuringRef.current) return
    if (pages.length > 0) {
      if (!selectedId || !pages.some((p) => p.id === selectedId)) {
        setSelectedId(pages[0].id)
      }
      return
    }

    ensuringRef.current = true
    const legacy = !migratedRef.current ? readLegacyKnowledge(machineId) : ''
    migratedRef.current = true

    void createMutate({
      machineId,
      title: legacy.trim() ? 'Übernommen (lokal)' : 'Neue Seite',
      body: legacy,
      sortOrder: 0,
    })
      .then((row) => {
        if (legacy.trim()) clearLegacyKnowledge(machineId)
        setSelectedId(row.id)
      })
      .catch((err: Error) => {
        setActionError(err.message)
        ensuringRef.current = false
      })
  }, [isLoading, error, pages, selectedId, machineId, createMutate])

  useEffect(() => {
    ensuringRef.current = false
    migratedRef.current = false
    lastLoadedId.current = null
    setSelectedId(null)
    setActionError(null)
  }, [machineId])

  useEffect(() => {
    if (!selected) return
    if (lastLoadedId.current === selected.id) return
    // Vor Seitenwechsel offenen Entwurf speichern
    flushPendingSave()
    lastLoadedId.current = selected.id
    setTitleDraft(selected.title)
    setBodyDraft(selected.body)
    setSaveState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden') flushPendingSave()
    }
    window.addEventListener('pagehide', flushPendingSave)
    window.addEventListener('beforeunload', flushPendingSave)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      flushPendingSave()
      window.removeEventListener('pagehide', flushPendingSave)
      window.removeEventListener('beforeunload', flushPendingSave)
      document.removeEventListener('visibilitychange', onHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId])

  function queueBodySave(nextBody: string) {
    if (!selected) return
    setSaveState('saving')
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void updateMutateRef
        .current({ id: selected.id, machineId, body: nextBody })
        .then(() => setSaveState('saved'))
        .catch((err: Error) => {
          setSaveState('error')
          setActionError(err.message)
        })
    }, 400)
  }

  function queueTitleSave(nextTitle: string) {
    if (!selected) return
    setSaveState('saving')
    if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current)
    titleTimerRef.current = window.setTimeout(() => {
      void updateMutateRef
        .current({ id: selected.id, machineId, title: nextTitle })
        .then(() => setSaveState('saved'))
        .catch((err: Error) => {
          setSaveState('error')
          setActionError(err.message)
        })
    }, 300)
  }

  async function handleNewPage() {
    flushPendingSave()
    setActionError(null)
    try {
      const row = await createPage.mutateAsync({
        machineId,
        title: `Seite ${pages.length + 1}`,
        body: '',
        sortOrder: pages.length,
      })
      lastLoadedId.current = null
      setSelectedId(row.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen')
    }
  }

  async function handleSaveNow() {
    if (!selected) return
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current)
    setActionError(null)
    setSaveState('saving')
    try {
      await updatePage.mutateAsync({
        id: selected.id,
        machineId,
        title: titleDraft,
        body: bodyDraft,
      })
      setSaveState('saved')
    } catch (err) {
      setSaveState('error')
      setActionError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  async function handleDelete() {
    if (!selected) return
    if (
      !window.confirm(
        `Seite „${selected.title.trim() || 'Neue Seite'}“ löschen? Das lässt sich nicht rückgängig machen.`,
      )
    ) {
      return
    }
    setActionError(null)
    const deletingId = selected.id
    try {
      await deletePage.mutateAsync({ id: deletingId, machineId })
      lastLoadedId.current = null
      const remaining = pages.filter((p) => p.id !== deletingId)
      setSelectedId(remaining[0]?.id ?? null)
      if (remaining.length === 0) ensuringRef.current = false
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    }
  }

  const schemaError =
    error instanceof Error && error.message.includes('FIX_MACHINE_KNOWLEDGE')
      ? error.message
      : actionError?.includes('FIX_MACHINE_KNOWLEDGE')
        ? actionError
        : null

  function PageItem({ page }: { page: MachineKnowledgePage }) {
    const active = page.id === selectedId
    return (
      <button
        type="button"
        onClick={() => {
          lastLoadedId.current = null
          setSelectedId(page.id)
        }}
        className={`hover:bg-kwd-surface-light flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
          active ? 'bg-kwd-primary/15' : ''
        }`}
      >
        <span className="truncate text-sm font-semibold">{page.title.trim() || 'Neue Seite'}</span>
        <span className="text-kwd-muted truncate text-[11px]">{preview(page.body)}</span>
        <span className="text-kwd-muted text-[10px]">{formatWhen(page.updated_at)}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-start">
      <section className="kwd-panel flex min-h-[28rem] flex-col overflow-hidden">
        <div className="kwd-panel-head flex flex-wrap items-center justify-between gap-2">
          <span>Maschinenwissen</span>
          <button
            type="button"
            className="kwd-btn kwd-btn-primary text-xs"
            onClick={() => void handleNewPage()}
            disabled={Boolean(schemaError) || createPage.isPending}
          >
            + Seite
          </button>
        </div>

        {schemaError && (
          <div className="border-kwd-warning/40 bg-kwd-warning/10 m-3 border px-3 py-2 text-sm">
            <p className="font-semibold">Datenbank noch nicht bereit</p>
            <p className="text-kwd-muted mt-1 text-xs">{MACHINE_KNOWLEDGE_SQL_HINT}</p>
            <button type="button" className="kwd-btn mt-2 text-xs" onClick={() => void refetch()}>
              Erneut laden
            </button>
          </div>
        )}

        {!schemaError && (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <aside className="border-kwd-border max-h-40 shrink-0 overflow-auto border-b sm:max-h-none sm:w-44 sm:border-r sm:border-b-0">
              {isLoading && <p className="text-kwd-muted px-3 py-3 text-xs">Laden…</p>}
              {pages.map((page) => (
                <PageItem key={page.id} page={page} />
              ))}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <div className="border-kwd-border flex flex-wrap items-center gap-2 border-b px-2 py-2">
                    <input
                      value={titleDraft}
                      onChange={(e) => {
                        const next = e.target.value
                        setTitleDraft(next)
                        queueTitleSave(next)
                      }}
                      placeholder="Seitentitel…"
                      className="border-kwd-border bg-kwd-paper min-h-[36px] min-w-[8rem] flex-1 border px-2 text-sm font-semibold"
                      aria-label="Seite umbenennen"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveNow()}
                      className="kwd-btn kwd-btn-primary shrink-0 text-xs"
                      disabled={updatePage.isPending}
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      className="kwd-btn kwd-btn-danger shrink-0 text-xs"
                      disabled={deletePage.isPending || pages.length <= 1}
                      title={
                        pages.length <= 1
                          ? 'Mindestens eine Seite bleibt bestehen'
                          : 'Seite löschen'
                      }
                    >
                      Löschen
                    </button>
                    <span className="text-kwd-muted ml-auto text-[11px] tabular-nums">
                      {saveState === 'saving' && 'Speichern…'}
                      {saveState === 'saved' && 'Gespeichert'}
                      {saveState === 'error' && 'Fehler'}
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
                    placeholder="Öltyp, kritische Parameter, Ersatzteile, Ansprechpartner…"
                    className="border-kwd-border bg-kwd-paper text-kwd-text min-h-[220px] w-full flex-1 resize-y border-0 px-3 py-2 text-sm leading-relaxed focus:outline-none"
                    aria-label="Wissenstext"
                  />
                  {actionError && !schemaError && (
                    <p className="text-kwd-danger border-kwd-border border-t px-3 py-2 text-xs">
                      {actionError}
                    </p>
                  )}
                  <p className="text-kwd-muted border-kwd-border border-t px-3 py-1.5 text-[10px]">
                    Mehrere Seiten · Autosave · beim Schließen/Vollbild-Wechsel wird mitgespeichert
                    (Cloud)
                  </p>
                </>
              ) : (
                !isLoading && (
                  <p className="text-kwd-muted px-4 py-8 text-center text-sm">
                    Noch keine Seite – „+ Seite“ anlegen.
                  </p>
                )
              )}
            </div>
          </div>
        )}
      </section>

      <Suspense fallback={<LoadingFallback label="Label wird erzeugt…" />}>
        <BarcodeLabel code={barcode} title={machineName} subtitle={location ?? undefined} />
      </Suspense>
    </div>
  )
}
