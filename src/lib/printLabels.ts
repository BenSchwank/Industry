import QRCode from 'qrcode'
import { normalizeBarcode } from './barcode'

export interface LabelPrintItem {
  code: string
  title: string
  subtitle?: string
}

const LABEL_SIZE = 160

async function toQrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(code, {
    width: LABEL_SIZE,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Öffnet ein Druckfenster mit mehreren Scan-Labels auf einem Blatt (A4-Raster).
 */
export async function printMachineLabels(items: LabelPrintItem[]): Promise<void> {
  if (items.length === 0) throw new Error('Keine Maschinen ausgewählt')

  const labels = await Promise.all(
    items.map(async (item) => {
      const code = normalizeBarcode(item.code)
      if (!code) throw new Error(`Scan-Code fehlt: ${item.title || 'unbekannt'}`)
      const qr = await toQrDataUrl(code)
      return { ...item, code, qr }
    }),
  )

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) throw new Error('Popup blockiert – bitte Popups für diese Seite erlauben')

  const cards = labels
    .map(
      (l) => `
      <article class="label">
        <img src="${l.qr}" alt="QR ${escapeHtml(l.code)}" width="${LABEL_SIZE}" height="${LABEL_SIZE}" />
        <h1>${escapeHtml(l.title)}</h1>
        ${l.subtitle ? `<p class="sub">${escapeHtml(l.subtitle)}</p>` : ''}
        <p class="code">${escapeHtml(l.code)}</p>
      </article>`,
    )
    .join('')

  win.document.write(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Scan-Labels (${labels.length})</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, Segoe UI, sans-serif;
      color: #0f172a;
      background: #fff;
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8mm 6mm;
      align-content: start;
    }
    .label {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6mm 4mm;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 72mm;
    }
    .label img { display: block; width: 32mm; height: 32mm; }
    .label h1 {
      font-size: 11pt;
      margin: 3mm 0 1mm;
      line-height: 1.2;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .label .sub {
      font-size: 8.5pt;
      color: #64748b;
      margin: 0 0 2mm;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .label .code {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 10pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin: 0;
    }
    .hint {
      display: none;
      font-size: 11px;
      color: #64748b;
      margin: 8px;
    }
    @media screen {
      body { background: #f1f5f9; padding: 16px; }
      .sheet {
        background: #fff;
        padding: 12mm;
        box-shadow: 0 1px 4px rgb(15 23 42 / 12%);
        max-width: 210mm;
        margin: 0 auto;
      }
      .hint { display: block; text-align: center; }
    }
  </style>
</head>
<body>
  <p class="hint">${labels.length} Label${labels.length === 1 ? '' : 's'} · Druckdialog öffnet sich automatisch</p>
  <div class="sheet">${cards}</div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`)
  win.document.close()
}
