-- KURZ-FIX: Nur Maschinen schreiben (im SQL Editor ausführen → Run)
-- Wenn das durchläuft, kannst du Maschinen wieder anlegen.

-- Rechte auf Tabellenebene
GRANT SELECT, INSERT, UPDATE, DELETE ON machines TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- RLS-Policies für Anon (Dev-Modus)
DROP POLICY IF EXISTS "Anon insert machines" ON machines;
DROP POLICY IF EXISTS "Anon update machines" ON machines;
DROP POLICY IF EXISTS "Anon delete machines" ON machines;
DROP POLICY IF EXISTS "Anon read machines" ON machines;

CREATE POLICY "Anon read machines" ON machines FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert machines" ON machines FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update machines" ON machines FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete machines" ON machines FOR DELETE TO anon USING (true);

-- Schnelltest (sollte 1 Zeile zurückgeben)
INSERT INTO machines (barcode, name, location, status)
VALUES ('KWD-M-SQLTEST', 'SQL-Test', 'Halle 1', 'active')
RETURNING id, barcode, name;

-- Aufräumen
DELETE FROM machines WHERE barcode = 'KWD-M-SQLTEST';
