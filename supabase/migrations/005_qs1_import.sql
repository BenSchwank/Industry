-- Externe IDs für QS1-Import & Sync
ALTER TABLE machines ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'kwd';

ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'kwd';

CREATE UNIQUE INDEX IF NOT EXISTS idx_machines_external
  ON machines (external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external
  ON maintenance_tasks (external_source, external_id)
  WHERE external_id IS NOT NULL;

-- Import-Log (Desktop)
CREATE TABLE IF NOT EXISTS import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'qs1',
  filename TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read import_runs" ON import_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write import_runs" ON import_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read import_runs" ON import_runs FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write import_runs" ON import_runs FOR INSERT TO anon WITH CHECK (true);
