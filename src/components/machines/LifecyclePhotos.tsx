import { useEffect, useRef, useState } from 'react'
import {
  assertLifecycleImage,
  useDeleteLifecyclePhoto,
  useLifecyclePhotoUrl,
  useUploadLifecyclePhotos,
  type LifecyclePhoto,
} from '../../hooks/useLifecyclePhotos'

function PhotoThumb({
  photo,
  onRemove,
}: {
  photo: LifecyclePhoto
  onRemove?: (photo: LifecyclePhoto) => void
}) {
  const { data: url, isLoading } = useLifecyclePhotoUrl(photo.storage_path)
  const [lightbox, setLightbox] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="border-kwd-border bg-kwd-surface-light relative h-16 w-16 shrink-0 overflow-hidden border"
        title={photo.filename}
      >
        {isLoading || !url ? (
          <span className="text-kwd-muted text-[10px]">…</span>
        ) : (
          <img src={url} alt={photo.filename} className="h-full w-full object-cover" />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(photo)}
          className="text-kwd-danger absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold shadow"
          title="Foto entfernen"
          aria-label="Foto entfernen"
        >
          ×
        </button>
      )}
      {lightbox && url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal
        >
          <img
            src={url}
            alt={photo.filename}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

export function LifecyclePhotoStrip({
  photos,
  canDelete,
}: {
  photos: LifecyclePhoto[]
  canDelete?: boolean
}) {
  const deletePhoto = useDeleteLifecyclePhoto()
  if (photos.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {photos.map((photo) => (
        <div key={photo.id} className="relative">
          <PhotoThumb
            photo={photo}
            onRemove={
              canDelete
                ? (p) => {
                    if (window.confirm('Foto löschen?')) void deletePhoto.mutateAsync(p)
                  }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  )
}

/** Lokale Vorschau vor dem Speichern */
export function PendingPhotoStrip({
  files,
  onRemove,
}: {
  files: File[]
  onRemove: (index: number) => void
}) {
  if (files.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file, i) => (
        <PendingThumb key={`${file.name}-${file.size}-${i}`} file={file} onRemove={() => onRemove(i)} />
      ))}
    </div>
  )
}

function PendingThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="relative">
      <div className="border-kwd-border h-16 w-16 overflow-hidden border">
        <img src={url} alt={file.name} className="h-full w-full object-cover" />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-kwd-danger absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold shadow"
        aria-label="Entfernen"
      >
        ×
      </button>
    </div>
  )
}

export function LifecyclePhotoPicker({
  machineId,
  entryId,
  onUploaded,
}: {
  machineId: string
  entryId: string
  onUploaded?: () => void
}) {
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const upload = useUploadLifecyclePhotos()
  const [error, setError] = useState<string | null>(null)

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setError(null)
    try {
      const files = [...list]
      for (const f of files) assertLifecycleImage(f)
      await upload.mutateAsync({ machineId, entryId, files })
      onUploaded?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen')
    } finally {
      if (galleryRef.current) galleryRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  return (
    <div className="mt-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/*"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={upload.isPending}
          className="kwd-btn text-xs"
        >
          {upload.isPending ? 'Lade hoch…' : '+ Foto'}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={upload.isPending}
          className="kwd-btn text-xs"
        >
          {upload.isPending ? 'Lade hoch…' : 'Galerie / Datei'}
        </button>
      </div>
      {error && <p className="text-kwd-danger mt-1 text-xs">{error}</p>}
    </div>
  )
}
