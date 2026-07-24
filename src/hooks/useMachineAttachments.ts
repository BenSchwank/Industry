import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyzePdfFile } from '../lib/pdfAnalysis'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'
import { LIFECYCLE_MEDIA_BUCKET, LIFECYCLE_PHOTOS_SQL_HINT } from './useLifecyclePhotos'

export const DOCS_BUCKET = 'machine-documents'
const MAX_BYTES = 50 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export interface MachineAttachment {
  id: string
  machine_id: string
  storage_path: string
  filename: string
  mime_type: string
  file_size_bytes: number | null
  title: string | null
  analysis_summary: string | null
  analysis_metadata: Record<string, unknown>
  analyzed_at: string | null
  created_at: string
}

export function isPdfAttachment(att: Pick<MachineAttachment, 'mime_type' | 'filename'>) {
  return (
    att.mime_type === 'application/pdf' ||
    att.filename.toLowerCase().endsWith('.pdf')
  )
}

export function isImageAttachment(att: Pick<MachineAttachment, 'mime_type' | 'filename'>) {
  if (att.mime_type.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif)$/i.test(att.filename)
}

/** Selbst angelegtes Text-Dokument (Unterlagen) */
export function isTextNoteAttachment(
  att: Pick<MachineAttachment, 'mime_type' | 'filename'> & {
    analysis_metadata?: Record<string, unknown> | null
  },
) {
  const meta = att.analysis_metadata ?? {}
  if (meta.kind === 'textnote') return true
  if (att.mime_type === 'text/plain' || att.mime_type === 'text/markdown') return true
  return /\.(txt|md)$/i.test(att.filename)
}

/** Bilder liegen im Lifecycle-Bucket (akzeptiert image/*), PDFs/Text im Dokumenten-Bucket. */
export function storageBucketForAttachment(
  att: Pick<MachineAttachment, 'mime_type' | 'filename' | 'storage_path'> & {
    analysis_metadata?: Record<string, unknown> | null
  },
) {
  if (att.storage_path.startsWith('attachments/')) return LIFECYCLE_MEDIA_BUCKET
  if (att.storage_path.startsWith('textnotes/')) return DOCS_BUCKET
  if (isTextNoteAttachment(att)) return DOCS_BUCKET
  if (isImageAttachment(att)) return LIFECYCLE_MEDIA_BUCKET
  return DOCS_BUCKET
}

function extForFile(file: File, mime: string) {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/plain') return 'txt'
  if (mime === 'text/markdown') return 'md'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && ['pdf', 'txt', 'md', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  if (mime.startsWith('image/')) return 'jpg'
  if (mime.startsWith('text/')) return 'txt'
  return 'pdf'
}

function resolveUploadMime(file: File): string {
  const raw = (file.type || '').toLowerCase()
  if (raw === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (raw === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
    return 'text/plain'
  }
  if (raw === 'text/markdown' || file.name.toLowerCase().endsWith('.md')) {
    return 'text/markdown'
  }
  if (IMAGE_TYPES.has(raw)) return raw
  if (/\.png$/i.test(file.name)) return 'image/png'
  if (/\.webp$/i.test(file.name)) return 'image/webp'
  if (/\.gif$/i.test(file.name)) return 'image/gif'
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg'
  throw new Error('Nur PDF, Text oder Bilder (JPEG, PNG, WebP, GIF) sind erlaubt.')
}

export function useMachineAttachments(machineId: string | null) {
  return useQuery({
    queryKey: ['machine-attachments', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machine_attachments')
        .select(
          'id, machine_id, storage_path, filename, mime_type, file_size_bytes, title, analysis_summary, analysis_metadata, analyzed_at, created_at',
        )
        .eq('machine_id', machineId!)
        .order('created_at', { ascending: false })

      if (error) throw new Error(formatSupabaseError(error))
      return (data ?? []) as MachineAttachment[]
    },
  })
}

export function useUploadMachineAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      machineId,
      file,
      title,
      runAnalysis,
    }: {
      machineId: string
      file: File
      title?: string
      runAnalysis?: boolean
    }) => {
      const mime = resolveUploadMime(file)
      if (file.size > MAX_BYTES) {
        throw new Error('Datei zu groß (max. 50 MB).')
      }

      const attachmentId = crypto.randomUUID()
      const ext = extForFile(file, mime)
      const isImage = mime.startsWith('image/')
      const isText = mime.startsWith('text/')
      const bucket = isImage ? LIFECYCLE_MEDIA_BUCKET : DOCS_BUCKET
      const storagePath = isImage
        ? `attachments/${machineId}/${attachmentId}.${ext}`
        : isText
          ? `textnotes/${machineId}/${attachmentId}.${ext}`
          : `${machineId}/${attachmentId}.pdf`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, { contentType: mime, upsert: false })

      if (uploadError) {
        const msg = [uploadError.message, (uploadError as { error?: string }).error]
          .filter(Boolean)
          .join(' ')
        if (/bucket not found/i.test(msg) && isImage) {
          throw new Error(LIFECYCLE_PHOTOS_SQL_HINT)
        }
        if (/invalid_mime_type|not supported/i.test(msg)) {
          throw new Error(
            'Dieser Dateityp ist im Storage noch nicht freigeschaltet. Bitte supabase/FIX_MACHINE_DOCUMENTS_IMAGES.sql bzw. FIX_LIFECYCLE_PHOTOS.sql ausführen.',
          )
        }
        throw new Error(formatSupabaseError(uploadError))
      }

      let analysis_summary: string | null = null
      let analysis_metadata: Record<string, unknown> = isImage
        ? { kind: 'image' }
        : isText
          ? { kind: 'textnote' }
          : {}
      let analyzed_at: string | null = null

      if (isText) {
        analysis_summary = await file.text()
        analyzed_at = new Date().toISOString()
      } else if (!isImage && runAnalysis) {
        try {
          const analysis = await analyzePdfFile(file)
          analysis_summary = analysis.summary
          analysis_metadata = {
            pageCount: analysis.pageCount,
            wordCount: analysis.wordCount,
            charCount: analysis.charCount,
            keywords: analysis.keywords,
            textPreview: analysis.textPreview.slice(0, 5000),
          }
          analyzed_at = new Date().toISOString()
        } catch {
          analysis_summary = 'Analyse fehlgeschlagen – PDF kann trotzdem angezeigt werden.'
        }
      } else if (isImage) {
        analysis_summary = 'Bild-Dokument (Unterlage)'
        analyzed_at = new Date().toISOString()
      }

      const baseTitle =
        title?.trim() ||
        file.name.replace(/\.(pdf|txt|md|jpe?g|png|webp|gif)$/i, '')

      const { data, error } = await supabase
        .from('machine_attachments')
        .insert({
          id: attachmentId,
          machine_id: machineId,
          storage_path: storagePath,
          filename: file.name,
          mime_type: mime,
          file_size_bytes: file.size,
          title: baseTitle || (isText ? 'Neues Dokument' : file.name),
          analysis_summary,
          analysis_metadata,
          analyzed_at,
        })
        .select()
        .single()

      if (error) {
        await supabase.storage.from(bucket).remove([storagePath])
        throw new Error(formatSupabaseError(error))
      }

      return data as MachineAttachment
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['machine-attachments', vars.machineId] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
  })
}

/** Leeres Text-Dokument in Unterlagen anlegen */
export function useCreateBlankTextDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      machineId,
      title,
    }: {
      machineId: string
      title?: string
    }) => {
      const attachmentId = crypto.randomUUID()
      const name = (title?.trim() || 'Neues Dokument').slice(0, 120)
      const storagePath = `textnotes/${machineId}/${attachmentId}.txt`
      const empty = new Blob([''], { type: 'text/plain' })

      const { error: uploadError } = await supabase.storage
        .from(DOCS_BUCKET)
        .upload(storagePath, empty, { contentType: 'text/plain', upsert: false })

      if (uploadError) {
        const msg = [uploadError.message, (uploadError as { error?: string }).error]
          .filter(Boolean)
          .join(' ')
        if (/invalid_mime_type|not supported/i.test(msg)) {
          // Bucket noch ohne text/plain – Inhalt nur in der DB (analysis_summary)
        } else if (!/already exists/i.test(msg)) {
          throw new Error(
            `${formatSupabaseError(uploadError)} – ggf. supabase/FIX_MACHINE_DOCUMENTS_IMAGES.sql ausführen.`,
          )
        }
      }

      const { data, error } = await supabase
        .from('machine_attachments')
        .insert({
          id: attachmentId,
          machine_id: machineId,
          storage_path: storagePath,
          filename: `${name}.txt`,
          mime_type: 'text/plain',
          file_size_bytes: 0,
          title: name,
          analysis_summary: '',
          analysis_metadata: { kind: 'textnote' },
          analyzed_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        await supabase.storage.from(DOCS_BUCKET).remove([storagePath])
        throw new Error(formatSupabaseError(error))
      }

      return data as MachineAttachment
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['machine-attachments', data.machine_id] })
    },
  })
}

/** Text-Dokument (Titel + Inhalt) speichern */
export function useUpdateTextDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      attachment,
      title,
      body,
    }: {
      attachment: MachineAttachment
      title: string
      body: string
    }) => {
      if (!isTextNoteAttachment(attachment)) {
        throw new Error('Nur Text-Dokumente können so bearbeitet werden.')
      }
      const nextTitle = title.trim() || 'Neues Dokument'
      const blob = new Blob([body], { type: 'text/plain' })
      const bucket = storageBucketForAttachment(attachment)

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(attachment.storage_path, blob, {
          contentType: 'text/plain',
          upsert: true,
        })

      if (uploadError) {
        // Fallback: nur DB speichern, falls Storage text/plain noch sperrt
        if (!/invalid_mime_type|not supported/i.test(uploadError.message)) {
          throw new Error(formatSupabaseError(uploadError))
        }
      }

      const { data, error } = await supabase
        .from('machine_attachments')
        .update({
          title: nextTitle,
          filename: `${nextTitle}.txt`,
          mime_type: 'text/plain',
          file_size_bytes: new TextEncoder().encode(body).length,
          analysis_summary: body,
          analysis_metadata: { kind: 'textnote' },
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', attachment.id)
        .select()
        .single()

      if (error) throw new Error(formatSupabaseError(error))
      return data as MachineAttachment
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['machine-attachments', data.machine_id] })
    },
  })
}

export function useAnalyzeMachineAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (attachment: MachineAttachment) => {
      if (!isPdfAttachment(attachment)) {
        throw new Error('Nur PDF-Dokumente können textlich analysiert werden.')
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from(storageBucketForAttachment(attachment))
        .download(attachment.storage_path)

      if (downloadError) throw new Error(formatSupabaseError(downloadError))

      const analysis = await analyzePdfFile(
        new File([fileData], attachment.filename, { type: 'application/pdf' }),
      )

      const { data, error } = await supabase
        .from('machine_attachments')
        .update({
          analysis_summary: analysis.summary,
          analysis_metadata: {
            pageCount: analysis.pageCount,
            wordCount: analysis.wordCount,
            charCount: analysis.charCount,
            keywords: analysis.keywords,
            textPreview: analysis.textPreview.slice(0, 5000),
          },
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', attachment.id)
        .select()
        .single()

      if (error) throw new Error(formatSupabaseError(error))
      return data as MachineAttachment
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['machine-attachments', data.machine_id] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
  })
}

export function useDeleteMachineAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (attachment: MachineAttachment) => {
      const bucket = storageBucketForAttachment(attachment)
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([attachment.storage_path])

      if (storageError) throw new Error(formatSupabaseError(storageError))

      const { error } = await supabase
        .from('machine_attachments')
        .delete()
        .eq('id', attachment.id)

      if (error) throw new Error(formatSupabaseError(error))
      return attachment.machine_id
    },
    onSuccess: (machineId) => {
      queryClient.invalidateQueries({ queryKey: ['machine-attachments', machineId] })
      queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['message-inbox'] })
    },
  })
}

export function useAttachmentSignedUrl(attachment: MachineAttachment | null) {
  return useQuery({
    queryKey: ['attachment-signed-url', attachment?.id, attachment?.storage_path],
    enabled: Boolean(attachment),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(storageBucketForAttachment(attachment!))
        .createSignedUrl(attachment!.storage_path, 3600)
      if (error) throw new Error(formatSupabaseError(error))
      return data.signedUrl
    },
    staleTime: 1000 * 60 * 50,
  })
}
