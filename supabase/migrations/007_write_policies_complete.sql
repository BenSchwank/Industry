-- Alle Schreib-Rechte für Dev-Modus (Anon) – einmal ausführen wenn Speichern fehlschlägt
-- Sicher: DROP + CREATE, damit kein Duplikat-Fehler entsteht

-- Maschinen
DROP POLICY IF EXISTS "Anon insert machines" ON machines;
DROP POLICY IF EXISTS "Anon update machines" ON machines;
CREATE POLICY "Anon insert machines" ON machines FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update machines" ON machines FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Lager
DROP POLICY IF EXISTS "Anon insert inventory_items" ON inventory_items;
DROP POLICY IF EXISTS "Anon update inventory_items" ON inventory_items;
DROP POLICY IF EXISTS "Anon insert inventory_batches" ON inventory_batches;
DROP POLICY IF EXISTS "Anon update inventory_batches" ON inventory_batches;
CREATE POLICY "Anon insert inventory_items" ON inventory_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update inventory_items" ON inventory_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon insert inventory_batches" ON inventory_batches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update inventory_batches" ON inventory_batches FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Wartung
DROP POLICY IF EXISTS "Anon insert maintenance_tasks" ON maintenance_tasks;
DROP POLICY IF EXISTS "Anon update maintenance_tasks" ON maintenance_tasks;
DROP POLICY IF EXISTS "Anon insert checklist_items" ON maintenance_checklist_items;
CREATE POLICY "Anon insert maintenance_tasks" ON maintenance_tasks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update maintenance_tasks" ON maintenance_tasks FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon insert checklist_items" ON maintenance_checklist_items FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon delete maintenance_tasks" ON maintenance_tasks;
CREATE POLICY "Anon delete maintenance_tasks" ON maintenance_tasks FOR DELETE TO anon USING (true);
DROP POLICY IF EXISTS "Anon delete checklist_items" ON maintenance_checklist_items;
CREATE POLICY "Anon delete checklist_items" ON maintenance_checklist_items FOR DELETE TO anon USING (true);
