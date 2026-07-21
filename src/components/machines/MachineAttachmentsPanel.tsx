import { useRef, useState } from 'react'
import { enqueueAiAnalysis, getAiQueueStatus } from '../../lib/aiAnalysisQueue'
import { formatFileSize } from '../../lib/pdfAnalysis'
import {
  useAnalyzeMachineAttachment,
  useDeleteMachineAttachment,
  useMachineAttachments,
  useUploadMachineAttachment,
  type MachineAttachment,
} from '../../hooks/useMachineAttachments'
import { SecurePdfViewer } from './SecurePdfViewer'

interface MachineAttachmentsPanelProps {
  machineId: string
  machineName: string
  /** Nach KI-Plan: Hinweis auf Tab Pläne */
  onPlanQueued?: () => void
}

export function MachineAttachmentsPanel({
  machineId,
  machineName,
  onPlanQueued,
}: MachineAttachmentsPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [autoAnalyze, setAutoAnalyze] = useState(true)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const { data: attachments = [], isLoading } = useMachineAttachments(machineId)
  const upload = useUploadMachineAttachment()
  const analyze = useAnalyzeMachineAttachment()
  const remove = useDeleteMachineAttachment()

  const selected = attachments.find((a) => a.id === selectedId) ?? attachments[0] ?? null

  async function handleFileChange(files: FileList | null) {
    if (!files?.length) return
    setUploadError(null)
    setInfo(null)

    for (const file of Array.from(files)) {
      try {
        const saved = await upload.mutateAsync({
          machineId,
          file,
          runAnalysis: autoAnalyze,
        })
        setSelectedId(saved.id)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
        break
      }
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleAnalyze(attachment: MachineAttachment) {
    setUploadError(null)
    setInfo(null)
    try {
      await analyze.mutateAsync(attachment)
      setInfo('Analyse abgeschlossen.')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Analyse fehlgeschlagen')
    }
  }

  async function handleDelete(attachment: MachineAttachment) {
    if (!confirm(`„${attachment.filename}" wirklich löschen?`)) return
    try {
      await remove.mutateAsync(attachment)
      if (selectedId === attachment.id) setSelectedId(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    }
  }

  function handleAiPlan(attachment: MachineAttachment) {
    setUploadError(null)
    enqueueAiAnalysis({
      attachmentId: attachment.id,
      machineId,
      storagePath: attachment.storage_path,
      filename: attachment.filename,
    })
    setInfo('KI-Wartungsplan in Warteschlange – Ergebnis unter Tab „Pläne“.')
    onPlanQueued?.()
  }

  const queueStatus = getAiQueueStatus(machineId)
  const keywords =
    selected && Array.isArray(selected.analysis_metadata?.keywords)
      ? (selected.analysis_metadata.keywords as string[])
      : []
  const pageCount = selected?.analysis_metadata?.pageCount
  const wordCount = selected?.analysis_metadata?.wordCount

  return (
    <section className="kwd-panel">
      <div className="kwd-panel-head flex flex-wrap items-center justify-between gap-2">
        <span>PDF-Dokumente · {machineName}</span>
        <div className="flex flex-wrap items-center gap-2 font-normal normal-case tracking-normal">
          <label className="text-kwd-muted flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
              className="accent-kwd-primary h-4 w-4"
            />
            Beim Upload analysieren
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="kwd-btn kwd-btn-primary"
          >
            {upload.isPending ? 'Lädt…' : '+ PDF anhängen'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <p className="text-kwd-muted text-xs">
          Unterlagen nur in der Software ansehen – kein Download, kein Öffnen in neuem Tab.
        </p>
        {queueStatus.length > 0 && (
          <p className="bg-kwd-primary/10 text-kwd-primary border-kwd-primary/30 border px-3 py-2 text-sm font-medium">
            {queueStatus.some((j) => j.status === 'processing')
              ? 'KI-Analyse läuft im Hintergrund…'
              : `${queueStatus.length} Analyse(n) in Warteschlange`}
          </p>
        )}
        {uploadError && (
          <p className="bg-kwd-danger/10 text-kwd-danger border-kwd-danger border px-3 py-2 text-sm font-medium">
            {uploadError}
          </p>
        )}
        {info && (
          <p className="bg-kwd-success/10 text-kwd-success border-kwd-success/40 border px-3 py-2 text-sm font-medium">
            {info}
          </p>
        )}

        {isLoading && <p className="text-kwd-muted text-sm">Lade Dokumente…</p>}

        {!isLoading && attachments.length === 0 && (
          <p className="text-kwd-muted border-kwd-border border border-dashed px-4 py-10 text-center text-sm">
            Noch keine PDFs – Handbuch oder Wartungsplan hochladen.
          </p>
        )}

        {attachments.length > 0 && (
          <div className="grid gap-3 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
            <ul className="flex flex-col gap-1.5">
              {attachments.map((att) => (
                <li key={att.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(att.id)}
                    className={`w-full border p-3 text-left text-sm ${
                      selected?.id === att.id
                        ? 'border-kwd-primary bg-kwd-primary/10'
                        : 'border-kwd-border hover:bg-kwd-surface-light'
                    }`}
                  >
                    <p className="font-semibold">{att.title ?? att.filename}</p>
                    <p className="text-kwd-muted mt-0.5 text-xs">
                      {formatFileSize(att.file_size_bytes)} ·{' '}
                      {new Date(att.created_at).toLocaleDateString('de-DE')}
                      {att.analyzed_at ? ' · analysiert' : ' · roh'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            {selected && (
              <div className="flex min-w-0 flex-col gap-3">
                <div className="border-kwd-border bg-kwd-surface relative z-10 flex flex-wrap gap-2 border p-2">
                  <p className="mr-auto self-center truncate text-sm font-semibold">
                    {selected.filename}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAiPlan(selected)}
                    className="kwd-btn kwd-btn-primary"
                  >
                    KI-Wartungsplan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAnalyze(selected)}
                    disabled={analyze.isPending}
                    className="kwd-btn"
                  >
                    {analyze.isPending
                      ? 'Analysiert…'
                      : selected.analyzed_at
                        ? 'Neu analysieren'
                        : 'Analysieren'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(selected)}
                    disabled={remove.isPending}
                    className="kwd-btn kwd-btn-danger"
                  >
                    Löschen
                  </button>
                </div>

                <div className="border-kwd-border bg-kwd-bg relative z-0 overflow-hidden border">
                  <SecurePdfViewer
                    key={selected.id}
                    storagePath={selected.storage_path}
                    filename={selected.filename}
                  />
                </div>

                <article className="border-kwd-border bg-kwd-surface border p-4">
                  <h4 className="text-base font-bold tracking-tight">Dokument-Analyse</h4>
                  {!selected.analysis_summary && !selected.analyzed_at ? (
                    <p className="text-kwd-muted mt-3 text-sm">
                      Noch nicht analysiert. „Analysieren“ oder „KI-Wartungsplan“ nutzen.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm">
                        {pageCount != null && (
                          <span className="bg-kwd-surface-light border-kwd-border border px-2 py-1 font-semibold">
                            {String(pageCount)} Seite(n)
                          </span>
                        )}
                        {wordCount != null && (
                          <span className="bg-kwd-surface-light border-kwd-border border px-2 py-1 font-semibold">
                            {String(wordCount)} Wörter
                          </span>
                        )}
                        {selected.analyzed_at && (
                          <span className="text-kwd-muted self-center text-xs">
                            {new Date(selected.analyzed_at).toLocaleString('de-DE')}
                          </span>
                        )}
                      </div>
                      {selected.analysis_summary && (
                        <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed">
                          {selected.analysis_summary}
                        </p>
                      )}
                      {keywords.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {keywords.map((kw) => (
                            <span
                              key={kw}
                              className="bg-kwd-primary/15 text-kwd-primary border-kwd-primary/30 border px-2.5 py-1 text-sm font-semibold"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </article>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
