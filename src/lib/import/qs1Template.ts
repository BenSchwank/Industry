/** Standard-Vorlage für QS1-CSV-Import (Semikolon-getrennt) */

export const QS1_TEMPLATE_DEFAULT = `# QS1 Import-Vorlage – Spalten mit Semikolon (;) trennen
# Zeilen mit # am Anfang werden ignoriert (Kommentare)
#
# Pflicht-Spalten (Namen flexibel, z.B. auch "Objektnummer" statt "Inventarnummer"):
#   Inventarnummer | Bezeichnung | Wartung
# Optional:
#   Standort | Intervall_Tage | Naechster_Termin | Checkliste (Punkte mit | trennen)
#
Inventarnummer;Bezeichnung;Standort;Wartung;Intervall_Tage;Naechster_Termin;Checkliste
M-100234;Hydraulikpresse 500t;Halle 3;Monatliche Inspektion;30;2026-08-01;Sichtprüfung|Schmierung|Sicherheit testen
M-100235;CNC-Fräsmaschine;Halle 1;Jährliche Wartung;365;2026-12-15;Geometrie prüfen|Spindelöl wechseln|Software-Backup`

export const QS1_TEMPLATE_STORAGE_KEY = 'kwd-qs1-template'

export function loadSavedTemplate(): string {
  try {
    return localStorage.getItem(QS1_TEMPLATE_STORAGE_KEY) ?? QS1_TEMPLATE_DEFAULT
  } catch {
    return QS1_TEMPLATE_DEFAULT
  }
}

export function saveTemplate(content: string) {
  localStorage.setItem(QS1_TEMPLATE_STORAGE_KEY, content)
}

export function downloadTemplate(content: string, filename = 'qs1-wartungsplan-vorlage.csv') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const QS1_COLUMN_HELP = [
  { name: 'Inventarnummer', required: true, aliases: 'Objektnummer, Equipment-ID, Code' },
  { name: 'Bezeichnung', required: true, aliases: 'Objektname, Maschine, Name' },
  { name: 'Standort', required: false, aliases: 'Ort, Halle, Einsatzort' },
  { name: 'Wartung', required: true, aliases: 'Betreff, Tätigkeit, Wartungsplan' },
  { name: 'Intervall_Tage', required: false, aliases: 'Intervall, Frequenz (30, monat, jahr)' },
  { name: 'Naechster_Termin', required: false, aliases: 'Fällig, Termin (TT.MM.JJJJ oder JJJJ-MM-TT)' },
  { name: 'Checkliste', required: false, aliases: 'Prüfpunkte mit | oder ; trennen' },
]
