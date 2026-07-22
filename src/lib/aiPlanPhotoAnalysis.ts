import { formatOpenAiError } from './openAiErrors'

export interface PlanPhotoMachine {
  name: string
  location?: string | null
  category?: string | null
  confidence?: 'high' | 'medium' | 'low'
}

export interface PlanPhotoAnalysisResult {
  machines: PlanPhotoMachine[]
  hallName?: string | null
  notes?: string | null
  usedAi: boolean
}

const SYSTEM_PROMPT = `Du bist Experte für industrielle Instandhaltung und Hallenpläne.
Analysiere das Foto eines Maschinenplans, einer Anlagenliste oder einer Wandtafel mit Geräten.

Extrahiere alle erkennbaren Maschinen/Geräte mit:
- name: Bezeichnung wie auf dem Plan (z. B. „Fräsmaschine DMG 500“, „Kompressor 3“)
- location: Standort/Halle/Bereich wenn erkennbar (z. B. „Halle 2“, „Linie A“, „Bereich Nord“)
- category: Gruppe/Abteilung wenn auf dem Plan erkennbar (sonst null)
- confidence: "high" | "medium" | "low" je nach Lesbarkeit

Regeln:
- Nur echte Maschinen/Geräte, keine Legenden, Überschriften oder Randtexte
- Bei unleserlichen Einträgen weglassen oder confidence "low"
- Deutsche Bezeichnungen beibehalten
- Keine erfundenen Details

Antworte NUR als JSON:
{"hall_name":"… oder null","notes":"Kurzer Hinweis zur Bildqualität oder null","machines":[{"name":"…","location":"… oder null","category":"… oder null","confidence":"high|medium|low"}]}`

export async function analyzePlanPhotoWithAi(
  base64: string,
  mime: string,
  apiKey?: string,
): Promise<PlanPhotoAnalysisResult> {
  const key = apiKey ?? import.meta.env.VITE_OPENAI_API_KEY
  if (!key) {
    throw new Error(
      'Foto-Erkennung benötigt VITE_OPENAI_API_KEY in der Umgebung (wie bei der KI-Wartungsanalyse).',
    )
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extrahiere alle Maschinen/Geräte aus diesem Plan-Foto für die Maschinenliste.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mime};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
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

  const parsed = JSON.parse(content) as {
    hall_name?: string | null
    notes?: string | null
    machines?: Array<Partial<PlanPhotoMachine>>
  }

  const machines = (parsed.machines ?? [])
    .map((m) => ({
      name: m.name?.trim() ?? '',
      location: m.location?.trim() || null,
      category: m.category?.trim() || null,
      confidence: m.confidence ?? 'medium',
    }))
    .filter((m) => m.name.length >= 2)
    .slice(0, 80)

  if (machines.length === 0) {
    throw new Error(
      'Keine Maschinen erkannt. Bitte Plan näher fotografieren oder schärferes Bild verwenden.',
    )
  }

  return {
    machines,
    hallName: parsed.hall_name?.trim() || null,
    notes: parsed.notes?.trim() || null,
    usedAi: true,
  }
}
