-- Lösch-Rechte für Verlaufseinträge (SQL Editor → Run)
-- Lebenslauf, Tickets, Wartungsabschlüsse

GRANT SELECT, INSERT, UPDATE, DELETE ON machine_lifecycle_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tickets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_completions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_completion_items TO anon, authenticated;

DROP POLICY IF EXISTS "Anon delete lifecycle" ON machine_lifecycle_entries;
CREATE POLICY "Anon delete lifecycle" ON machine_lifecycle_entries FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon delete tickets" ON tickets;
CREATE POLICY "Anon delete tickets" ON tickets FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon delete completions" ON maintenance_completions;
CREATE POLICY "Anon delete completions" ON maintenance_completions FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon delete completion_items" ON maintenance_completion_items;
CREATE POLICY "Anon delete completion_items" ON maintenance_completion_items FOR DELETE TO anon USING (true);
