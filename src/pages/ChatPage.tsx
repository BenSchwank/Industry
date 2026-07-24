import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { LifecycleImagePickButtons } from '../components/machines/LifecyclePhotos'
import {
  CHAT_SQL_HINT,
  useChatAttachmentUrl,
  useChatColleagues,
  useChatConversations,
  useChatMessages,
  useChatRealtime,
  useCreateChat,
  useSendChatMessage,
  type ChatAttachment,
  type ChatConversation,
} from '../hooks/useTeamChat'
import { resolveUsernames } from '../lib/resolveUsernames'
import { useAuthStore } from '../stores/authStore'
import { useQuery } from '@tanstack/react-query'

function conversationLabel(
  conv: ChatConversation,
  selfId: string | undefined,
  names: Map<string, string>,
) {
  if (conv.kind === 'group') {
    return conv.title?.trim() || 'Gruppe'
  }
  const other = conv.memberIds.find((id) => id !== selfId)
  return (other && names.get(other)) || 'Direktnachricht'
}

function ChatImage({ attachment }: { attachment: ChatAttachment }) {
  const { data: url, isLoading } = useChatAttachmentUrl(attachment.storage_path)
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function handleDownload(e: MouseEvent) {
    e.stopPropagation()
    if (!url) return
    setDownloading(true)
    try {
      const { downloadFromUrl } = await import('../lib/downloadFile')
      await downloadFromUrl(url, attachment.filename || 'chat-bild.jpg')
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading || !url) {
    return (
      <div className="bg-kwd-surface-light text-kwd-muted flex h-28 w-28 items-center justify-center rounded-lg text-xs">
        …
      </div>
    )
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-lg">
        <img src={url} alt={attachment.filename} className="max-h-40 max-w-[220px] object-cover" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal
        >
          <img
            src={url}
            alt={attachment.filename}
            className="max-h-[85vh] max-w-[96vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute top-3 right-3 flex gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="min-h-[44px] rounded-full bg-white/90 px-4 text-sm font-bold"
              onClick={(e) => void handleDownload(e)}
              disabled={downloading}
            >
              {downloading ? '…' : 'Download'}
            </button>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px] rounded-full bg-white/90 text-lg font-bold"
              onClick={() => setOpen(false)}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default function ChatPage() {
  const selfId = useAuthStore((s) => s.user?.id)
  const selfName = useAuthStore((s) => s.profile?.username)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [composer, setComposer] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newMode, setNewMode] = useState<'dm' | 'group'>('dm')
  const [picked, setPicked] = useState<string[]>([])
  const [groupTitle, setGroupTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: conversations = [], isLoading, error: listError } = useChatConversations()
  const { data: messages = [], isLoading: loadingMsgs } = useChatMessages(activeId)
  const { data: colleagues = [] } = useChatColleagues()
  const createChat = useCreateChat()
  const sendMessage = useSendChatMessage()
  useChatRealtime(activeId)

  const allUserIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of conversations) for (const id of c.memberIds) ids.add(id)
    for (const m of messages) if (m.sender_id) ids.add(m.sender_id)
    for (const c of colleagues) ids.add(c.id)
    return [...ids]
  }, [conversations, messages, colleagues])

  const { data: nameMap } = useQuery({
    queryKey: ['chat-names', allUserIds.join(',')],
    enabled: allUserIds.length > 0,
    queryFn: () => resolveUsernames(allUserIds),
  })

  const names = nameMap ?? new Map<string, string>()
  const active = conversations.find((c) => c.id === activeId) ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, activeId])

  function togglePick(id: string) {
    setPicked((prev) => {
      if (newMode === 'dm') return prev.includes(id) ? [] : [id]
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    })
  }

  async function handleCreate() {
    setError(null)
    if (picked.length === 0) {
      setError('Bitte mindestens einen Kollegen wählen')
      return
    }
    try {
      const id = await createChat.mutateAsync({
        kind: newMode,
        title: newMode === 'group' ? groupTitle : null,
        memberIds: picked,
      })
      setShowNew(false)
      setPicked([])
      setGroupTitle('')
      setActiveId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat anlegen fehlgeschlagen')
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!activeId) return
    const text = composer.trim()
    if (!text && pendingFiles.length === 0) return
    setError(null)
    try {
      await sendMessage.mutateAsync({
        conversationId: activeId,
        body: text || undefined,
        files: pendingFiles,
      })
      setComposer('')
      setPendingFiles([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Senden fehlgeschlagen')
    }
  }

  const schemaHint =
    listError instanceof Error && /FIX_TEAM_CHAT/i.test(listError.message)
      ? listError.message
      : null

  return (
    <div className="flex h-[calc(100svh-7.5rem)] flex-col gap-0 lg:h-[calc(100svh-4rem)] lg:flex-row">
      {/* Liste */}
      <aside
        className={`border-kwd-border bg-kwd-surface flex w-full flex-col border-b lg:w-80 lg:border-r lg:border-b-0 ${
          activeId ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <header className="flex items-center justify-between gap-2 p-3">
          <div>
            <h2 className="text-lg font-bold">Team-Chat</h2>
            <p className="text-kwd-muted text-xs">Mit angemeldeten Kollegen schreiben</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowNew(true)
              setNewMode('dm')
              setPicked([])
              setError(null)
            }}
            className="bg-kwd-primary text-kwd-bg min-h-[44px] rounded-xl px-3 text-sm font-bold"
          >
            Neu
          </button>
        </header>

        {schemaHint && (
          <p className="text-kwd-warning mx-3 mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs">
            {schemaHint}
          </p>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="text-kwd-muted p-4 text-sm">Lade Chats…</p>}
          {!isLoading && conversations.length === 0 && !schemaHint && (
            <p className="text-kwd-muted p-4 text-sm">
              Noch keine Chats. Tippe auf <strong>Neu</strong>, um zu starten.
            </p>
          )}
          <ul>
            {conversations.map((c) => {
              const label = conversationLabel(c, selfId, names)
              const activeRow = c.id === activeId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`hover:bg-kwd-primary/10 w-full border-b border-kwd-border/60 px-4 py-3 text-left ${
                      activeRow ? 'bg-kwd-primary/15' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{label}</span>
                      {c.kind === 'group' && (
                        <span className="text-kwd-muted text-[10px] font-bold uppercase">
                          Gruppe
                        </span>
                      )}
                    </span>
                    <span className="text-kwd-muted mt-0.5 line-clamp-1 block text-xs">
                      {c.lastMessage || 'Noch keine Nachrichten'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>

      {/* Thread */}
      <section
        className={`bg-kwd-bg flex min-w-0 flex-1 flex-col ${
          activeId ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {!activeId ? (
          <div className="text-kwd-muted flex flex-1 items-center justify-center p-6 text-sm">
            Chat links auswählen oder neu starten
          </div>
        ) : (
          <>
            <header className="border-kwd-border bg-kwd-surface flex items-center gap-2 border-b px-3 py-2">
              <button
                type="button"
                className="kwd-btn min-h-[40px] px-3 text-sm lg:hidden"
                onClick={() => setActiveId(null)}
              >
                Zurück
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {active ? conversationLabel(active, selfId, names) : 'Chat'}
                </p>
                {active?.kind === 'group' && (
                  <p className="text-kwd-muted truncate text-xs">
                    {active.memberIds
                      .map((id) => (id === selfId ? selfName : names.get(id)) ?? '…')
                      .join(', ')}
                  </p>
                )}
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {loadingMsgs && <p className="text-kwd-muted text-sm">Lade Nachrichten…</p>}
              {messages.map((m) => {
                const mine = m.sender_id === selfId
                const sender =
                  m.sender_id === selfId
                    ? 'Du'
                    : m.sender_id
                      ? (names.get(m.sender_id) ?? 'Kollege')
                      : 'Unbekannt'
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-kwd-muted mb-0.5 text-[11px]">
                      {sender} ·{' '}
                      {new Date(m.created_at).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        mine
                          ? 'bg-kwd-primary text-kwd-bg rounded-br-md'
                          : 'bg-kwd-surface border-kwd-border rounded-bl-md border'
                      }`}
                    >
                      {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                      {m.attachments.length > 0 && (
                        <div className={`mt-2 flex flex-wrap gap-2 ${m.body ? '' : ''}`}>
                          {m.attachments.map((a) => (
                            <ChatImage key={a.id} attachment={a} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {error && (
              <p className="text-kwd-danger px-3 text-xs font-medium">{error}</p>
            )}

            <form
              onSubmit={handleSend}
              className="border-kwd-border bg-kwd-surface safe-area-bottom border-t p-3"
            >
              {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingFiles.map((f, i) => (
                    <span
                      key={`${f.name}-${i}`}
                      className="bg-kwd-bg border-kwd-border inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                    >
                      {f.name}
                      <button
                        type="button"
                        className="text-kwd-danger font-bold"
                        onClick={() =>
                          setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mb-2">
                <LifecycleImagePickButtons
                  onFiles={(list) => {
                    if (!list) return
                    setPendingFiles((prev) => [...prev, ...Array.from(list)].slice(0, 4))
                  }}
                  cameraLabel="Foto"
                  galleryLabel="Bild"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder="Nachricht schreiben…"
                  className="bg-kwd-bg border-kwd-surface-light min-h-[48px] flex-1 rounded-xl border px-4 text-base"
                />
                <button
                  type="submit"
                  disabled={
                    sendMessage.isPending || (!composer.trim() && pendingFiles.length === 0)
                  }
                  className="bg-kwd-primary text-kwd-bg min-h-[48px] rounded-xl px-5 font-bold disabled:opacity-50"
                >
                  {sendMessage.isPending ? '…' : 'Senden'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="bg-kwd-surface border-kwd-border max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl">
            <h3 className="text-lg font-bold">Neuer Chat</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewMode('dm')
                  setPicked((p) => p.slice(0, 1))
                }}
                className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                  newMode === 'dm'
                    ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                    : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
                }`}
              >
                Direkt
              </button>
              <button
                type="button"
                onClick={() => setNewMode('group')}
                className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${
                  newMode === 'group'
                    ? 'border-kwd-primary bg-kwd-primary/15 text-kwd-primary'
                    : 'border-kwd-surface-light bg-kwd-bg text-kwd-muted'
                }`}
              >
                Gruppe
              </button>
            </div>

            {newMode === 'group' && (
              <label className="mt-3 block">
                <span className="text-kwd-muted text-sm font-medium">Gruppenname</span>
                <input
                  type="text"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="z.B. Frühschicht"
                  className="bg-kwd-bg border-kwd-surface-light mt-1 min-h-[48px] w-full rounded-xl border px-4"
                />
              </label>
            )}

            <p className="text-kwd-muted mt-3 text-xs font-semibold tracking-wide uppercase">
              Kollegen {newMode === 'dm' ? '(einen wählen)' : '(mehrere)'}
            </p>
            <ul className="border-kwd-border mt-2 max-h-56 overflow-y-auto rounded-xl border">
              {colleagues.length === 0 && (
                <li className="text-kwd-muted px-3 py-3 text-sm">Keine anderen Nutzer aktiv.</li>
              )}
              {colleagues.map((c) => {
                const on = picked.includes(c.id)
                return (
                  <li key={c.id} className="border-kwd-border border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => togglePick(c.id)}
                      className={`w-full px-3 py-3 text-left text-sm font-semibold ${
                        on ? 'bg-kwd-primary/15 text-kwd-primary' : ''
                      }`}
                    >
                      {c.username}
                      {on ? ' ✓' : ''}
                    </button>
                  </li>
                )
              })}
            </ul>

            {error && <p className="text-kwd-danger mt-2 text-sm">{error}</p>}
            {!schemaHint && error && /FIX_TEAM_CHAT/i.test(error) && (
              <p className="text-kwd-muted mt-1 text-xs">{CHAT_SQL_HINT}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="bg-kwd-surface-light min-h-[48px] flex-1 rounded-xl font-semibold"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={createChat.isPending || picked.length === 0}
                onClick={() => void handleCreate()}
                className="bg-kwd-primary text-kwd-bg min-h-[48px] flex-1 rounded-xl font-bold disabled:opacity-50"
              >
                {createChat.isPending ? '…' : 'Starten'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
