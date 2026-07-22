/** OpenAI-API-Fehler in verständliches Deutsch übersetzen. */
export function formatOpenAiError(status: number, bodyText: string): string {
  let message = ''
  try {
    const json = JSON.parse(bodyText) as { error?: { message?: string; code?: string } }
    message = json.error?.message ?? ''
  } catch {
    message = bodyText.slice(0, 200)
  }

  const lower = message.toLowerCase()

  if (
    status === 429 ||
    lower.includes('quota') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('insufficient_quota')
  ) {
    return (
      'OpenAI-Guthaben aufgebraucht (Fehler 429). ' +
      'Bitte unter platform.openai.com → Billing Guthaben aufladen oder Zahlungsmethode prüfen. ' +
      'Danach in Vercel den Schlüssel VITE_OPENAI_API_KEY kontrollieren und die App neu laden.'
    )
  }

  if (status === 401 || lower.includes('invalid api key') || lower.includes('incorrect api key')) {
    return (
      'OpenAI-API-Schlüssel ungültig (Fehler 401). ' +
      'Bitte unter platform.openai.com/api-keys einen neuen Schlüssel erstellen ' +
      'und als VITE_OPENAI_API_KEY in Vercel eintragen.'
    )
  }

  if (status === 403) {
    return (
      'OpenAI-Zugriff verweigert (Fehler 403). ' +
      'Prüfen Sie API-Schlüssel, Organisation und ob Vision/Chat für Ihr Konto freigeschaltet ist.'
    )
  }

  if (status >= 500) {
    return `OpenAI-Server vorübergehend nicht erreichbar (${status}). Bitte in ein paar Minuten erneut versuchen.`
  }

  if (message) {
    return `OpenAI-Fehler (${status}): ${message}`
  }

  return `OpenAI-Fehler (${status}). Bitte API-Schlüssel und Guthaben prüfen.`
}
