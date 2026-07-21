-- Anon darf geplante Wartungs-/Reparatur-Aufgaben löschen (Dev-Modus)

GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_tasks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_checklist_items TO anon, authenticated;

DROP POLICY IF EXISTS "Anon delete maintenance_tasks" ON maintenance_tasks;
CREATE POLICY "Anon delete maintenance_tasks" ON maintenance_tasks
  FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon delete checklist_items" ON maintenance_checklist_items;
CREATE POLICY "Anon delete checklist_items" ON maintenance_checklist_items
  FOR DELETE TO anon USING (true);
