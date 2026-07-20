-- KWD: Checklisten, Wartungshistorie & Auth-Schreibrechte
-- Im Supabase SQL Editor ausführen (nach 001 und 002)

-- Checklisten-Schritte pro Wartungsaufgabe
CREATE TABLE maintenance_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Abgeschlossene Wartungen (Historie)
CREATE TABLE maintenance_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Snapshot der abgehakten Schritte
CREATE TABLE maintenance_completion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES maintenance_completions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_checklist_items_task ON maintenance_checklist_items (task_id, sort_order);
CREATE INDEX idx_completions_task ON maintenance_completions (task_id, completed_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE maintenance_completions;

-- RLS
ALTER TABLE maintenance_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_completion_items ENABLE ROW LEVEL SECURITY;

-- Authenticated: voller Zugriff
CREATE POLICY "Auth read checklist_items" ON maintenance_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write checklist_items" ON maintenance_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read completions" ON maintenance_completions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write completions" ON maintenance_completions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read completion_items" ON maintenance_completion_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write completion_items" ON maintenance_completion_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon: Lesen für Prototyp ohne Login
CREATE POLICY "Anon read checklist_items" ON maintenance_checklist_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read completions" ON maintenance_completions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read completion_items" ON maintenance_completion_items FOR SELECT TO anon USING (true);

-- Anon: Schreiben für Dev (Tickets + Wartung) – später durch Auth ersetzen
CREATE POLICY "Anon write tickets" ON tickets FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon write completions" ON maintenance_completions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon write completion_items" ON maintenance_completion_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update maintenance_tasks" ON maintenance_tasks FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Beispiel-Wartungsaufgabe + Checkliste für MCH-001
INSERT INTO maintenance_tasks (machine_id, title, frequency_days, next_due_date)
SELECT id, 'Monatliche Inspektion', 30, CURRENT_DATE
FROM machines WHERE barcode = 'MCH-001'
AND NOT EXISTS (
  SELECT 1 FROM maintenance_tasks mt
  JOIN machines m ON m.id = mt.machine_id
  WHERE m.barcode = 'MCH-001' AND mt.title = 'Monatliche Inspektion'
);

INSERT INTO maintenance_checklist_items (task_id, label, sort_order)
SELECT mt.id, step.label, step.ord
FROM maintenance_tasks mt
JOIN machines m ON m.id = mt.machine_id
CROSS JOIN (VALUES
  ('Sichtprüfung auf Undichtigkeiten', 1),
  ('Schmierstellen nachfüllen', 2),
  ('Sicherheitseinrichtungen testen', 3),
  ('Betriebsstunden dokumentieren', 4),
  ('Reinigung durchführen', 5)
) AS step(label, ord)
WHERE m.barcode = 'MCH-001' AND mt.title = 'Monatliche Inspektion'
AND NOT EXISTS (
  SELECT 1 FROM maintenance_checklist_items ci WHERE ci.task_id = mt.id
);
