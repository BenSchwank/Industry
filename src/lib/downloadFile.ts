/** Datei vom Browser speichern (PC / Handy). */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const safeName = (filename || 'bild').replace(/[/\\?%*:|"<>]/g, '_').trim() || 'bild'

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = safeName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000)
  } catch {
    // Fallback: neuer Tab / Browser-Download
    const a = document.createElement('a')
    a.href = url
    a.download = safeName
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}
