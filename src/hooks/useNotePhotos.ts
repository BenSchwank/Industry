import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import {
  assertLifecycleImage,
  isLifecyclePhotosSchemaMissingError,
  LIFECYCLE_MEDIA_BUCKET,
} from './useLifecyclePhotos'

export const NOTE_PHOTOS_SQL_HINT =
  'Notiz-Fotos brauchen einmalig: in Supabase → SQL → supabase/FIX_NOTE_PHOTOS.sql ausführen.'

export interface NotePhoto {
  id: string
  note_id: string
  owner_id: string
  storage_path: string
  filename: string
  mime_type: string
  file_size_bytes: number | null
  created_at: string
}

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

function isMissingNotePhotosSchema(error: { code?: string; message?: string }) {
  const msg = error.message ?? ''
  return (
    isLifecyclePhotosSchemaMissingError(error) ||
    error.code === 'PGRST205' ||
    /user_note_photos|could not find the table/i.test(msg)
  )
}

function notePhotoError(error: { message: string; code?: string }) {
  if (isMissingNotePhotosSchema(error)) return new Error(NOTE_PHOTOS_SQL_HINT)
  return new Error(formatSupabaseError(error))
}

export async function uploadNotePhotoFiles(params: {
  noteId: string
  ownerId: string
  files: File[]
}): Promise<NotePhoto[]> {
  const { noteId, ownerId, files } = params
  if (files.length === 0) return []

  const uploaded: NotePhoto[] = []
  const folder = `notes/${ownerId}/${noteId}`

  for (const file of files) {
    const mime = assertLifecycleImage(file)
    const photoId = crypto.randomUUID()
    const ext = extForMime(mime, file.name)
    const storagePath = `${folder}/${photoId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(LIFECYCLE_MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: mime, upsert: false })

    if (uploadError) throw notePhotoError(uploadError)

    const payload = {
      id: photoId,
      note_id: noteId,
      owner_id: ownerId,
      storage_path: storagePath,
      filename: file.name || `foto.${ext}`,
      mime_type: mime,
      file_size_bytes: file.size,
    }

    const { data, error } = await supabase
      .from('user_note_photos')
      .insert(payload as never)
      .select(
        'id, note_id, owner_id, storage_path, filename, mime_type, file_size_bytes, created_at',
      )
      .single()

    if (error) {
      await supabase.storage.from(LIFECYCLE_MEDIA_BUCKET).remove([storagePath])
      throw notePhotoError(error)
    }

    uploaded.push(data as NotePhoto)
  }

  return uploaded
}

export function useNotePhotos(noteId: string | null) {
  return useQuery({
    queryKey: ['note-photos', noteId],
    enabled: Boolean(noteId),
    queryFn: async (): Promise<NotePhoto[]> => {
      const { data, error } = await supabase
        .from('user_note_photos')
        .select(
          'id, note_id, owner_id, storage_path, filename, mime_type, file_size_bytes, created_at',
        )
        .eq('note_id', noteId!)
        .order('created_at', { ascending: true })

      if (error) {
        if (isMissingNotePhotosSchema(error)) return []
        throw notePhotoError(error)
      }
      return (data ?? []) as NotePhoto[]
    },
  })
}

export function useUploadNotePhotos() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (input: { noteId: string; files: File[] }) => {
      if (!userId) throw new Error('Nicht angemeldet')
      return uploadNotePhotoFiles({
        noteId: input.noteId,
        ownerId: userId,
        files: input.files,
      })
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['note-photos', vars.noteId] })
    },
  })
}

export function useDeleteNotePhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (photo: NotePhoto) => {
      await supabase.storage.from(LIFECYCLE_MEDIA_BUCKET).remove([photo.storage_path])
      const { error } = await supabase.from('user_note_photos').delete().eq('id', photo.id)
      if (error) throw notePhotoError(error)
      return photo
    },
    onSuccess: (photo) => {
      void queryClient.invalidateQueries({ queryKey: ['note-photos', photo.note_id] })
    },
  })
}
