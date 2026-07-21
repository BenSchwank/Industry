const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85
const MAX_BYTES = 8 * 1024 * 1024

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function assertPlanPhotoFile(file: File) {
  const mime = file.type || 'image/jpeg'
  if (!ALLOWED.has(mime) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    throw new Error('Nur Bilder (JPEG, PNG, WebP, GIF) sind erlaubt.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Bild zu groß (max. 8 MB).')
  }
}

/** Bild für KI-Analyse verkleinern und als Base64 zurückgeben. */
export async function preparePlanPhotoForAnalysis(
  file: File,
): Promise<{ base64: string; mime: string; previewUrl: string }> {
  assertPlanPhotoFile(file)

  const previewUrl = URL.createObjectURL(file)
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Bild konnte nicht verarbeitet werden.')
  }

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Bild-Komprimierung fehlgeschlagen.'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })

  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }

  return {
    base64: btoa(binary),
    mime: 'image/jpeg',
    previewUrl,
  }
}
