import { formatOpenAiError } from './openAiErrors'
import { analyzePdfBuffer } from './pdfAnalysis'

export interface AiMaintenancePlan {
  title: string
  frequency_days: number
  checklist_items: string[]
  summary: string
}

const SYSTEM_PROMPT = `Du bist ein Experte für industrielle Instandhaltung.
Analysiere den folgenden Text aus einem Wartungshandbuch und extrahiere:
1. Einen passenden Titel für die Wartungsaufgabe
2. Empfohlenes Wartungsintervall in Tagen (frequency_days)
3. Eine Checkliste konkreter Prüfschritte (5-15 Punkte, auf Deutsch, kurz und präzise)

Antworte NUR als JSON:
{"title":"...","frequency_days":30,"checklist_items":["..."],"summary":"Kurze Zusammenfassung"}`

export async function analyzeMaintenanceWithAi(
  pdfBuffer: ArrayBuffer,
  apiKey?: string,
): Promise<AiMaintenancePlan> {
  const extracted = await analyzePdfBuffer(pdfBuffer)
  const text = extracted.textPreview.slice(0, 12000)

  if (!text.trim()) {
    return fallbackPlan(extracted.summary)
  }

  const key = apiKey ?? import.meta.env.VITE_OPENAI_API_KEY
  if (!key) {
    return fallbackFromText(text, extracted.summary)
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `PDF-Text (${extracted.pageCount} Seiten):\n\n${text}` },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(formatOpenAiError(response.status, err))
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Keine KI-Antwort erhalten')

  const parsed = JSON.parse(content) as Partial<AiMaintenancePlan>
  return {
    title: parsed.title?.trim() || 'Wartungsplan aus Dokument',
    frequency_days: Math.max(1, parsed.frequency_days ?? 30),
    checklist_items: (parsed.checklist_items ?? []).filter(Boolean).slice(0, 20),
    summary: parsed.summary?.trim() || extracted.summary,
  }
}

function fallbackFromText(text: string, summary: string): AiMaintenancePlan {
  const lines = text
    .split(/[\n•\-–]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 10 && l.length < 120)
    .slice(0, 10)

  return {
    title: 'Wartungsplan (lokal analysiert)',
    frequency_days: 30,
    checklist_items: lines.length > 0 ? lines : ['Sichtprüfung durchführen', 'Dokumentation prüfen'],
    summary: `${summary}\n\n(Hinweis: VITE_OPENAI_API_KEY nicht gesetzt – lokale Analyse)`,
  }
}

function fallbackPlan(summary: string): AiMaintenancePlan {
  return {
    title: 'Wartungsplan (manuell prüfen)',
    frequency_days: 30,
    checklist_items: ['Handbuch manuell durchgehen', 'Wartungsschritte eintragen'],
    summary,
  }
}

export async function callEdgeFunctionAnalysis(
  attachmentId: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<AiMaintenancePlan> {
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-maintenance-doc`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ attachment_id: attachmentId }),
  })

  if (!res.ok) {
    throw new Error(`Edge Function Fehler: ${res.status}`)
  }

  return res.json() as Promise<AiMaintenancePlan>
}
