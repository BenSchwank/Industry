import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'
import {
  assertLifecycleImage,
  isLifecyclePhotosSchemaMissingError,
  LIFECYCLE_MEDIA_BUCKET,
  LIFECYCLE_PHOTOS_SQL_HINT,
} from './useLifecyclePhotos'

export interface TicketPhoto {
  id: string
  ticket_id: string
  machine_id: string | null
  storage_path: string
  filename: string
  mime_type: string
  file_size_bytes: number | null
  created_at: string
}

export const TICKET_PHOTOS_SQL_HINT =
  'Störungs-Fotos brauchen einmalig die Datenbank-Erweiterung: in Supabase → SQL → supabase/FIX_TICKET_PHOTOS.sql (und ggf. FIX_LIFECYCLE_PHOTOS.sql) ausführen.'

function extForMime(mime: string, filename: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  const fromName = filename.split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  return 'jpg'
}

function isMissingTicketPhotosSchema(error: { code?: string; message?: string }) {
  const msg = error.message ?? ''
  return (
    isLifecyclePhotosSchemaMissingError(error) ||
    error.code === 'PGRST205' ||
    /ticket_photos|could not find the table/i.test(msg)
  )
}

export async function uploadTicketPhotoFiles(params: {
  ticketId: string
  machineId: string | null
  files: File[]
}): Promise<TicketPhoto[]> {
  const { ticketId, machineId, files } = params
  if (files.length === 0) return []

  const uploaded: TicketPhoto[] = []
  const folder = machineId ? `${machineId}/tickets/${ticketId}` : `tickets/${ticketId}`

  for (const file of files) {
    const mime = assertLifecycleImage(file)
    const photoId = crypto.randomUUID()
    const ext = extForMime(mime, file.name)
    const storagePath = `${folder}/${photoId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(LIFECYCLE_MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: mime, upsert: false })

    if (uploadError) {
      if (isMissingTicketPhotosSchema(uploadError)) {
        throw new Error(TICKET_PHOTOS_SQL_HINT)
      }
      throw new Error(formatSupabaseError(uploadError))
    }

    const payload = {
      id: photoId,
      ticket_id: ticketId,
      machine_id: machineId,
      storage_path: storagePath,
      filename: file.name || `foto.${ext}`,
      mime_type: mime,
      file_size_bytes: file.size,
    }

    const { data, error } = await supabase
      .from('ticket_photos')
      // Tabelle ggf. noch nicht in generierten Types
      .insert(payload as never)
      .select(
        'id, ticket_id, machine_id, storage_path, filename, mime_type, file_size_bytes, created_at',
      )
      .single()

    if (error) {
      await supabase.storage.from(LIFECYCLE_MEDIA_BUCKET).remove([storagePath])
      if (isMissingTicketPhotosSchema(error)) {
        throw new Error(
          /ticket_photos/i.test(error.message) ? TICKET_PHOTOS_SQL_HINT : LIFECYCLE_PHOTOS_SQL_HINT,
        )
      }
      throw new Error(formatSupabaseError(error))
    }

    uploaded.push(data as TicketPhoto)
  }

  return uploaded
}

export function useTicketPhotosForMachine(machineId: string | null) {
  return useQuery({
    queryKey: ['ticket-photos', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_photos')
        .select(
          'id, ticket_id, machine_id, storage_path, filename, mime_type, file_size_bytes, created_at',
        )
        .eq('machine_id', machineId!)
        .order('created_at', { ascending: true })

      if (error) {
        if (isMissingTicketPhotosSchema(error)) return [] as TicketPhoto[]
        throw new Error(formatSupabaseError(error))
      }
      return (data ?? []) as TicketPhoto[]
    },
  })
}

export function useTicketPhotos(ticketId: string | null) {
  return useQuery({
    queryKey: ['ticket-photos-one', ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_photos')
        .select(
          'id, ticket_id, machine_id, storage_path, filename, mime_type, file_size_bytes, created_at',
        )
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: true })

      if (error) {
        if (isMissingTicketPhotosSchema(error)) return [] as TicketPhoto[]
        throw new Error(formatSupabaseError(error))
      }
      return (data ?? []) as TicketPhoto[]
    },
  })
}

export function useUploadTicketPhotos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: uploadTicketPhotoFiles,
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-photos-one', vars.ticketId] })
      if (vars.machineId) {
        void queryClient.invalidateQueries({ queryKey: ['ticket-photos', vars.machineId] })
        void queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machineId] })
      }
    },
  })
}

export function useDeleteTicketPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (photo: TicketPhoto) => {
      await supabase.storage.from(LIFECYCLE_MEDIA_BUCKET).remove([photo.storage_path])
      const { error } = await supabase.from('ticket_photos').delete().eq('id', photo.id)
      if (error) throw new Error(formatSupabaseError(error))
      return photo
    },
    onSuccess: (photo) => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-photos-one', photo.ticket_id] })
      if (photo.machine_id) {
        void queryClient.invalidateQueries({ queryKey: ['ticket-photos', photo.machine_id] })
      }
    },
  })
}
