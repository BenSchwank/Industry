import { copyToClipboard } from '../../lib/excelClipboard'
import { useDbWriteAccess } from '../../hooks/useDbWriteAccess'
import { useState } from 'react'

const SETUP_SQL = `-- In Supabase: Dashboard → SQL → New query → einfügen → Run
-- Datei: supabase/RUN_007_008.sql

DROP POLICY IF EXISTS "Anon insert machines" ON machines;
DROP POLICY IF EXISTS "Anon update machines" ON machines;
CREATE POLICY "Anon insert machines" ON machines FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update machines" ON machines FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- … vollständiges Skript siehe supabase/RUN_007_008.sql im Projektordner`

export function DbSetupBanner() {
  const { data, isLoading } = useDbWriteAccess()
  const [copied, setCopied] = useState(false)

  if (isLoading || !data || data.ok) return null

  async function handleCopy() {
    const ok = await copyToClipboard(SETUP_SQL)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div className="border-kwd-danger bg-kwd-danger/15 border-b px-3 py-2">
      <p className="text-kwd-danger text-sm font-bold">DB: Schreiben nicht möglich</p>
      <p className="text-kwd-muted mt-1 text-xs">{data.message}</p>
      <ol className="text-kwd-muted mt-2 list-decimal space-y-1 pl-4 text-xs">
        <li>
          <a
            href="https://supabase.com/dashboard/project/cbivfqqmiahwxsehsukq/sql/new"
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            Supabase SQL Editor
          </a>{' '}
          öffnen
        </li>
        <li>
          Datei <code>supabase/RUN_007_008.sql</code> komplett ausführen
        </li>
        <li>Seite neu laden</li>
      </ol>
      <button type="button" onClick={handleCopy} className="kwd-btn mt-2 text-xs">
        {copied ? 'Kopiert' : 'Hinweis kopieren'}
      </button>
    </div>
  )
}
