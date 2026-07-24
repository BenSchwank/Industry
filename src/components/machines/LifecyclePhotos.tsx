import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { downloadFromUrl } from '../../lib/downloadFile'
import {
  assertLifecycleImage,
  useDeleteLifecyclePhoto,
  useLifecyclePhotoUrl,
  useUploadLifecyclePhotos,
  type LifecyclePhoto,
} from '../../hooks/useLifecyclePhotos'
import { useDeleteTicketPhoto, useUploadTicketPhotos, type TicketPhoto } from '../../hooks/useTicketPhotos'

/** display:none bricht auf manchen Handys den Galerie-Dialog – optisch verstecken statt hidden */
const fileInputCls =
  'absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 opacity-0'
const pickBtnCls = 'kwd-btn inline-flex min-h-[44px] cursor-pointer items-center justify-center text-xs'

function PhotoThumb({
  photo,
  onRemove,
  size = 'sm',
}: {
  photo: LifecyclePhoto
  onRemove?: (photo: LifecyclePhoto) => void
  size?: 'sm' | 'lg'
}) {
  const { data: url, isLoading } = useLifecyclePhotoUrl(photo.storage_path)
  const [lightbox, setLightbox] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const box = size === 'lg' ? 'h-28 w-28 sm:h-36 sm:w-36' : 'h-16 w-16'

  async function handleDownload(e: MouseEvent) {
    e.stopPropagation()
    if (!url) return
    setDownloading(true)
    try {
      await downloadFromUrl(url, photo.filename || 'foto.jpg')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className={`border-kwd-border bg-kwd-surface-light relative shrink-0 overflow-hidden border ${box}`}
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
          className="text-kwd-danger absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold shadow"
          title="Foto entfernen"
          aria-label="Foto entfernen"
        >
          ×
        </button>
      )}
      {lightbox && url && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal
        >
          <img
            src={url}
            alt={photo.filename}
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
              onClick={() => setLightbox(false)}
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

export function LifecyclePhotoStrip({
  photos,
  canDelete,
  size = 'sm',
}: {
  photos: LifecyclePhoto[]
  canDelete?: boolean
  size?: 'sm' | 'lg'
}) {
  const deletePhoto = useDeleteLifecyclePhoto()
  if (photos.length === 0) return null

  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${size === 'lg' ? 'gap-3' : ''}`}>
      {photos.map((photo) => (
        <div key={photo.id} className="relative">
          <PhotoThumb
            photo={photo}
            size={size}
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

/** Anzeige für Störungs-Fotos (gleicher Storage-Bucket) */
export function TicketPhotoStrip({
  photos,
  canDelete,
  size = 'sm',
}: {
  photos: TicketPhoto[]
  canDelete?: boolean
  size?: 'sm' | 'lg'
}) {
  const deletePhoto = useDeleteTicketPhoto()
  if (photos.length === 0) return null

  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${size === 'lg' ? 'gap-3' : ''}`}>
      {photos.map((photo) => (
        <div key={photo.id} className="relative">
          <PhotoThumb
            photo={{
              id: photo.id,
              entry_id: photo.ticket_id,
              machine_id: photo.machine_id ?? '',
              storage_path: photo.storage_path,
              filename: photo.filename,
              mime_type: photo.mime_type,
              file_size_bytes: photo.file_size_bytes,
              created_at: photo.created_at,
            }}
            size={size}
            onRemove={
              canDelete
                ? () => {
                    if (window.confirm('Foto löschen?')) void deletePhoto.mutateAsync(photo)
                  }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  )
}

export function TicketPhotoPicker({
  ticketId,
  machineId,
  onUploaded,
}: {
  ticketId: string
  machineId: string | null
  onUploaded?: () => void
}) {
  const upload = useUploadTicketPhotos()
  const [error, setError] = useState<string | null>(null)

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setError(null)
    try {
      const files = [...list]
      for (const f of files) assertLifecycleImage(f)
      await upload.mutateAsync({ ticketId, machineId, files })
      onUploaded?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen')
    }
  }

  return (
    <div className="mt-2">
      <LifecycleImagePickButtons
        onFiles={(list) => void onFiles(list)}
        disabled={upload.isPending}
        cameraLabel="+ Foto"
        galleryLabel="Galerie / Datei"
        pendingLabel="Lade hoch…"
      />
      {error && <p className="text-kwd-danger mt-1 text-xs">{error}</p>}
    </div>
  )
}

/** Lokale Vorschau vor dem Speichern */
export function PendingPhotoStrip({
  files,
  onRemove,
}: {
  files: File[]
  onRemove?: (index: number) => void
}) {
  if (files.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file, i) => (
        <PendingThumb
          key={`${file.name}-${file.size}-${i}`}
          file={file}
          onRemove={onRemove ? () => onRemove(i) : undefined}
          size={onRemove ? 'sm' : 'lg'}
        />
      ))}
    </div>
  )
}

function PendingThumb({
  file,
  onRemove,
  size = 'sm',
}: {
  file: File
  onRemove?: () => void
  size?: 'sm' | 'lg'
}) {
  const [url] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const box = size === 'lg' ? 'h-28 w-28 sm:h-36 sm:w-36' : 'h-16 w-16'
  return (
    <div className="relative">
      <div className={`border-kwd-border overflow-hidden border ${box}`}>
        <img src={url} alt={file.name} className="h-full w-full object-cover" />
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-kwd-danger absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold shadow"
          aria-label="Entfernen"
        >
          ×
        </button>
      )}
    </div>
  )
}

type ImagePickMode = 'camera' | 'gallery'

/**
 * Kamera + Galerie/Datei – Label-basiert, damit der Dialog auch auf dem Handy öffnet.
 * (Programmatisches input.click() + display:none scheitert oft auf iOS/Android.)
 */
export function LifecycleImagePickButtons({
  onFiles,
  disabled,
  cameraLabel = 'Foto aufnehmen',
  galleryLabel = 'Galerie / Datei',
  multiple = true,
  pendingLabel = 'Lade…',
}: {
  onFiles: (files: FileList | null) => void
  disabled?: boolean
  cameraLabel?: string
  galleryLabel?: string
  multiple?: boolean
  pendingLabel?: string
}) {
  const baseId = useId()
  const cameraId = `${baseId}-camera`
  const galleryId = `${baseId}-gallery`
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  function handleChange(mode: ImagePickMode, list: FileList | null) {
    onFiles(list)
    const el = mode === 'camera' ? cameraRef.current : galleryRef.current
    if (el) el.value = ''
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={cameraRef}
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        className={fileInputCls}
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => handleChange('camera', e.target.files)}
      />
      <input
        ref={galleryRef}
        id={galleryId}
        type="file"
        accept="image/*"
        multiple={multiple}
        className={fileInputCls}
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => handleChange('gallery', e.target.files)}
      />
      <label
        htmlFor={cameraId}
        className={`${pickBtnCls} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        aria-disabled={disabled}
      >
        {disabled ? pendingLabel : cameraLabel}
      </label>
      <label
        htmlFor={galleryId}
        className={`${pickBtnCls} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        aria-disabled={disabled}
      >
        {disabled ? pendingLabel : galleryLabel}
      </label>
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
    }
  }

  return (
    <div className="mt-2">
      <LifecycleImagePickButtons
        onFiles={(list) => void onFiles(list)}
        disabled={upload.isPending}
        cameraLabel="+ Foto"
        galleryLabel="Galerie / Datei"
        pendingLabel="Lade hoch…"
      />
      {error && <p className="text-kwd-danger mt-1 text-xs">{error}</p>}
    </div>
  )
}
