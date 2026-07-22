import { formatOpenAiError } from './openAiErrors'
import { parsePlanFlexibleDate } from './planPhotoDates'

export interface PlanPhotoMachine {
  name: string
  /** Maschinennummer / Inventar / Scan-Code vom Plan */
  machine_number?: string | null
  location?: string | null
  category?: string | null
  last_maintenance_at?: string | null
  next_maintenance_at?: string | null
  last_maintenance_code?: string | null
  next_maintenance_code?: string | null
  last_cutting_oil_at?: string | null
  next_cutting_oil_at?: string | null
  last_hydraulic_oil_at?: string | null
  next_hydraulic_oil_at?: string | null
  last_hydraulic_code?: string | null
  confidence?: 'high' | 'medium' | 'low'
}

export interface PlanPhotoAnalysisResult {
  machines: PlanPhotoMachine[]
  hallName?: string | null
  notes?: string | null
  usedAi: boolean
}

const SYSTEM_PROMPT = `Du bist Experte für industrielle Wartungspläne und Tabellen-Aushänge (KWD).
Analysiere das Foto einer Wartungstabelle / Anlagenliste.

Extrahiere JEDE erkennbare Maschinenzeile mit diesen Spalten (wie auf dem Aushang):
- name: Spalte „Maschine“ (Bezeichnung)
- machine_number: Spalte „Maschinennummer“ (Nummer/Inventar/Code), sonst null
- location: Standort/Halle wenn irgendwo erkennbar, sonst null
- category: sichtbare Gruppenüberschrift/Block (z. B. Pfauter, Hänel, Kompressoren), sonst null
- last_maintenance_at: „letzte Wartung“ – Datum als gedruckt (z. B. „Dez 25“, „01.12.2025“) oder ISO, sonst null / „-“ → null
- next_maintenance_at: „nächste geplante Wartung“
- last_maintenance_code: Code neben letzter Wartung: E (extern), I (intern), IB (Inbetriebnahme), sonst null
- next_maintenance_code: Code neben nächster Wartung (E/I), sonst null
- last_cutting_oil_at: „letzter Schneidöl-Wechsel“
- next_cutting_oil_at: „nächster geplanter Schneidöl-Wechsel“
- last_hydraulic_oil_at: „letzter Hyd.-Ölwechsel“
- next_hydraulic_oil_at: „nächster Hyd.-Ölwechsel“
- last_hydraulic_code: Code neben Hydraulik (W / IB / K), sonst null
- confidence: "high" | "medium" | "low"

Regeln:
- Nur echte Maschinenzeilen, keine Überschriften der Tabelle selbst
- „-“ / leer → null
- Deutsche Monatsangaben beibehalten wenn kein volles Datum lesbar
- Keine erfundenen Werte
- Alle sichtbaren Zeilen erfassen (auch Hänel Lean Lift usw.)

Antworte NUR als JSON:
{"hall_name":null,"notes":null,"machines":[{"name":"…","machine_number":null,"location":null,"category":null,"last_maintenance_at":null,"next_maintenance_at":null,"last_maintenance_code":null,"next_maintenance_code":null,"last_cutting_oil_at":null,"next_cutting_oil_at":null,"last_hydraulic_oil_at":null,"next_hydraulic_oil_at":null,"last_hydraulic_code":null,"confidence":"medium"}]}`

function normDate(v: string | null | undefined): string | null {
  return parsePlanFlexibleDate(v)
}

function normCode(v: string | null | undefined): string | null {
  const t = v?.trim()
  if (!t || t === '-' || t === '–') return null
  return t.toUpperCase()
}

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
              text: 'Extrahiere die Wartungsplan-Tabelle vollständig: Maschine, Maschinennummer, Wartung, Schneidöl, Hydrauliköl inkl. Codes.',
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
      machine_number: m.machine_number?.trim() || null,
      location: m.location?.trim() || null,
      category: m.category?.trim() || null,
      last_maintenance_at: normDate(m.last_maintenance_at),
      next_maintenance_at: normDate(m.next_maintenance_at),
      last_maintenance_code: normCode(m.last_maintenance_code),
      next_maintenance_code: normCode(m.next_maintenance_code),
      last_cutting_oil_at: normDate(m.last_cutting_oil_at),
      next_cutting_oil_at: normDate(m.next_cutting_oil_at),
      last_hydraulic_oil_at: normDate(m.last_hydraulic_oil_at),
      next_hydraulic_oil_at: normDate(m.next_hydraulic_oil_at),
      last_hydraulic_code: normCode(m.last_hydraulic_code),
      confidence: m.confidence ?? 'medium',
    }))
    .filter((m) => m.name.length >= 2)
    .slice(0, 120)

  if (machines.length === 0) {
    return {
      machines: [],
      hallName: parsed.hall_name?.trim() || null,
      notes:
        parsed.notes?.trim() ||
        'Keine Maschinen erkannt – bitte in der Vorschau manuell ergänzen.',
      usedAi: true,
    }
  }

  return {
    machines,
    hallName: parsed.hall_name?.trim() || null,
    notes: parsed.notes?.trim() || null,
    usedAi: true,
  }
}
