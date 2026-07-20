import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'

export const LIFECYCLE_MEDIA_BUCKET = 'machine-lifecycle-media'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export interface LifecyclePhoto {
  id: string
  entry_id: string
  machine_id: string
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

export function assertLifecycleImage(file: File) {
  const mime = file.type || 'image/jpeg'
  if (!ALLOWED.has(mime) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    throw new Error('Nur Bilder (JPEG, PNG, WebP, GIF) sind erlaubt.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Bild zu groß (max. 10 MB).')
  }
  return mime.startsWith('image/') ? mime : 'image/jpeg'
}

export async function uploadLifecyclePhotoFiles(params: {
  machineId: string
  entryId: string
  files: File[]
}): Promise<LifecyclePhoto[]> {
  const { machineId, entryId, files } = params
  if (files.length === 0) return []

  const uploaded: LifecyclePhoto[] = []

  for (const file of files) {
    const mime = assertLifecycleImage(file)
    const photoId = crypto.randomUUID()
    const ext = extForMime(mime, file.name)
    const storagePath = `${machineId}/${entryId}/${photoId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(LIFECYCLE_MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: mime, upsert: false })

    if (uploadError) throw new Error(formatSupabaseError(uploadError))

    const { data, error } = await supabase
      .from('machine_lifecycle_photos')
      .insert({
        id: photoId,
        entry_id: entryId,
        machine_id: machineId,
        storage_path: storagePath,
        filename: file.name,
        mime_type: mime,
        file_size_bytes: file.size,
      })
      .select(
        'id, entry_id, machine_id, storage_path, filename, mime_type, file_size_bytes, created_at',
      )
      .single()

    if (error) {
      await supabase.storage.from(LIFECYCLE_MEDIA_BUCKET).remove([storagePath])
      throw new Error(formatSupabaseError(error))
    }

    uploaded.push(data as LifecyclePhoto)
  }

  return uploaded
}

export function useLifecyclePhotosForMachine(machineId: string | null) {
  return useQuery({
    queryKey: ['lifecycle-photos', machineId],
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machine_lifecycle_photos')
        .select(
          'id, entry_id, machine_id, storage_path, filename, mime_type, file_size_bytes, created_at',
        )
        .eq('machine_id', machineId!)
        .order('created_at', { ascending: true })

      if (error) {
        // Tabelle fehlt noch → leere Liste, UI bleibt nutzbar
        if (error.code === '42P01' || /does not exist|relation/i.test(error.message)) {
          return [] as LifecyclePhoto[]
        }
        throw new Error(formatSupabaseError(error))
      }
      return (data ?? []) as LifecyclePhoto[]
    },
  })
}

export function useLifecyclePhotoUrl(storagePath: string | null) {
  return useQuery({
    queryKey: ['lifecycle-photo-url', storagePath],
    enabled: Boolean(storagePath),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(LIFECYCLE_MEDIA_BUCKET)
        .createSignedUrl(storagePath!, 3600)
      if (error) throw new Error(formatSupabaseError(error))
      return data.signedUrl
    },
    staleTime: 1000 * 60 * 50,
  })
}

export function useUploadLifecyclePhotos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: uploadLifecyclePhotoFiles,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['lifecycle-photos', vars.machineId] })
      queryClient.invalidateQueries({ queryKey: ['machine-timeline', vars.machineId] })
    },
  })
}

export function useDeleteLifecyclePhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (photo: LifecyclePhoto) => {
      await supabase.storage.from(LIFECYCLE_MEDIA_BUCKET).remove([photo.storage_path])
      const { error } = await supabase.from('machine_lifecycle_photos').delete().eq('id', photo.id)
      if (error) throw new Error(formatSupabaseError(error))
      return photo
    },
    onSuccess: (photo) => {
      queryClient.invalidateQueries({ queryKey: ['lifecycle-photos', photo.machine_id] })
      queryClient.invalidateQueries({ queryKey: ['machine-timeline', photo.machine_id] })
    },
  })
}
