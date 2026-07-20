export interface PdfAnalysisResult {
  pageCount: number
  wordCount: number
  charCount: number
  keywords: string[]
  textPreview: string
  summary: string
}

const MAINTENANCE_KEYWORDS = [
  'wartung',
  'reparatur',
  'inspektion',
  'sicherheit',
  'kalibrierung',
  'schmierung',
  'ersatzteil',
  'garantie',
  'prüfung',
  'störung',
  'bedienung',
  'anleitung',
  'manual',
  'maintenance',
  'repair',
  'safety',
  'inspection',
]

function findKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  return MAINTENANCE_KEYWORDS.filter((kw) => lower.includes(kw))
}

function buildSummary(result: Omit<PdfAnalysisResult, 'summary'>): string {
  const parts: string[] = []
  parts.push(`${result.pageCount} Seite(n), ${result.wordCount} Wörter`)
  if (result.keywords.length > 0) {
    parts.push(`Themen: ${result.keywords.slice(0, 8).join(', ')}`)
  }
  if (result.textPreview.trim()) {
    const preview = result.textPreview.trim().slice(0, 280)
    parts.push(`Auszug: ${preview}${result.textPreview.length > 280 ? '…' : ''}`)
  } else {
    parts.push('Kein extrahierbarer Text (evtl. gescanntes Bild-PDF).')
  }
  return parts.join('\n\n')
}

export async function analyzePdfBuffer(buffer: ArrayBuffer): Promise<PdfAnalysisResult> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href

  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const pageCount = doc.numPages
  const textParts: string[] = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    textParts.push(pageText)
  }

  const fullText = textParts.join('\n')
  const words = fullText.split(/\s+/).filter(Boolean)
  const keywords = findKeywords(fullText)
  const textPreview = fullText.slice(0, 2000)

  const base = {
    pageCount,
    wordCount: words.length,
    charCount: fullText.length,
    keywords,
    textPreview,
  }

  return {
    ...base,
    summary: buildSummary(base),
  }
}

export async function analyzePdfFile(file: File): Promise<PdfAnalysisResult> {
  const buffer = await file.arrayBuffer()
  return analyzePdfBuffer(buffer)
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '–'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
