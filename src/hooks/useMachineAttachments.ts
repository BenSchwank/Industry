import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyzePdfFile } from '../lib/pdfAnalysis'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'

const BUCKET = 'machine-documents'

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

export function useAttachmentSignedUrl(storagePath: string | null) {
  return useQuery({
    queryKey: ['attachment-url', storagePath],
    enabled: Boolean(storagePath),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath!, 3600)

      if (error) throw new Error(formatSupabaseError(error))
      return data.signedUrl
    },
    staleTime: 1000 * 60 * 50,
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
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Nur PDF-Dateien sind erlaubt.')
      }
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('Datei zu groß (max. 50 MB).')
      }

      const attachmentId = crypto.randomUUID()
      const storagePath = `${machineId}/${attachmentId}.pdf`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })

      if (uploadError) throw new Error(formatSupabaseError(uploadError))

      let analysis_summary: string | null = null
      let analysis_metadata: Record<string, unknown> = {}
      let analyzed_at: string | null = null

      if (runAnalysis) {
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
      }

      const { data, error } = await supabase
        .from('machine_attachments')
        .insert({
          id: attachmentId,
          machine_id: machineId,
          storage_path: storagePath,
          filename: file.name,
          mime_type: 'application/pdf',
          file_size_bytes: file.size,
          title: title?.trim() || file.name.replace(/\.pdf$/i, ''),
          analysis_summary,
          analysis_metadata,
          analyzed_at,
        })
        .select()
        .single()

      if (error) {
        await supabase.storage.from(BUCKET).remove([storagePath])
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

export function useAnalyzeMachineAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (attachment: MachineAttachment) => {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
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
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
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
