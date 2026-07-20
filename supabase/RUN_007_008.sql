-- Einmal im Supabase SQL Editor ausführen (Dashboard → SQL → New query → Run)
-- Enthält fehlende Tabellen (003, 006) + Schreib-Rechte (007) + PDF-Anhänge (008)
-- Sicher mehrfach ausführbar (idempotent)

-- ========== 003: Fehlende Checklisten-Tabellen (falls noch nicht ausgeführt) ==========

CREATE TABLE IF NOT EXISTS maintenance_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_completion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES maintenance_completions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_task ON maintenance_checklist_items (task_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_completions_task ON maintenance_completions (task_id, completed_at DESC);

ALTER TABLE maintenance_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_completion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read checklist_items" ON maintenance_checklist_items;
DROP POLICY IF EXISTS "Auth write checklist_items" ON maintenance_checklist_items;
DROP POLICY IF EXISTS "Anon read checklist_items" ON maintenance_checklist_items;
CREATE POLICY "Auth read checklist_items" ON maintenance_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write checklist_items" ON maintenance_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read checklist_items" ON maintenance_checklist_items FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Auth read completions" ON maintenance_completions;
DROP POLICY IF EXISTS "Auth write completions" ON maintenance_completions;
DROP POLICY IF EXISTS "Anon read completions" ON maintenance_completions;
DROP POLICY IF EXISTS "Anon write completions" ON maintenance_completions;
CREATE POLICY "Auth read completions" ON maintenance_completions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write completions" ON maintenance_completions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read completions" ON maintenance_completions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write completions" ON maintenance_completions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Auth read completion_items" ON maintenance_completion_items;
DROP POLICY IF EXISTS "Auth write completion_items" ON maintenance_completion_items;
DROP POLICY IF EXISTS "Anon read completion_items" ON maintenance_completion_items;
DROP POLICY IF EXISTS "Anon write completion_items" ON maintenance_completion_items;
CREATE POLICY "Auth read completion_items" ON maintenance_completion_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write completion_items" ON maintenance_completion_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read completion_items" ON maintenance_completion_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write completion_items" ON maintenance_completion_items FOR INSERT TO anon WITH CHECK (true);

-- ========== 006: Maschinen-Lebenslauf (falls noch nicht ausgeführt) ==========

DO $$ BEGIN
  CREATE TYPE lifecycle_entry_type AS ENUM ('maintenance', 'repair', 'inspection', 'note');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS machine_lifecycle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  entry_type lifecycle_entry_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_machine ON machine_lifecycle_entries (machine_id, occurred_at DESC);

ALTER TABLE machine_lifecycle_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read lifecycle" ON machine_lifecycle_entries;
DROP POLICY IF EXISTS "Auth write lifecycle" ON machine_lifecycle_entries;
DROP POLICY IF EXISTS "Anon read lifecycle" ON machine_lifecycle_entries;
DROP POLICY IF EXISTS "Anon insert lifecycle" ON machine_lifecycle_entries;
CREATE POLICY "Auth read lifecycle" ON machine_lifecycle_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write lifecycle" ON machine_lifecycle_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read lifecycle" ON machine_lifecycle_entries FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert lifecycle" ON machine_lifecycle_entries FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon delete lifecycle" ON machine_lifecycle_entries;
CREATE POLICY "Anon delete lifecycle" ON machine_lifecycle_entries FOR DELETE TO anon USING (true);

-- ========== 007: Schreib-Rechte (Anon Dev-Modus) ==========

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

DROP POLICY IF EXISTS "Anon insert machines" ON machines;
DROP POLICY IF EXISTS "Anon update machines" ON machines;
DROP POLICY IF EXISTS "Anon delete machines" ON machines;
DROP POLICY IF EXISTS "Anon read machines" ON machines;
CREATE POLICY "Anon read machines" ON machines FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert machines" ON machines FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update machines" ON machines FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete machines" ON machines FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon insert inventory_items" ON inventory_items;
DROP POLICY IF EXISTS "Anon update inventory_items" ON inventory_items;
DROP POLICY IF EXISTS "Anon insert inventory_batches" ON inventory_batches;
DROP POLICY IF EXISTS "Anon update inventory_batches" ON inventory_batches;
CREATE POLICY "Anon insert inventory_items" ON inventory_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update inventory_items" ON inventory_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon insert inventory_batches" ON inventory_batches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update inventory_batches" ON inventory_batches FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon insert maintenance_tasks" ON maintenance_tasks;
DROP POLICY IF EXISTS "Anon update maintenance_tasks" ON maintenance_tasks;
DROP POLICY IF EXISTS "Anon insert checklist_items" ON maintenance_checklist_items;
CREATE POLICY "Anon insert maintenance_tasks" ON maintenance_tasks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update maintenance_tasks" ON maintenance_tasks FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon insert checklist_items" ON maintenance_checklist_items FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon insert tickets" ON tickets;
DROP POLICY IF EXISTS "Anon update tickets" ON tickets;
DROP POLICY IF EXISTS "Anon write tickets" ON tickets;
CREATE POLICY "Anon insert tickets" ON tickets FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update tickets" ON tickets FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon delete tickets" ON tickets;
CREATE POLICY "Anon delete tickets" ON tickets FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon delete completions" ON maintenance_completions;
CREATE POLICY "Anon delete completions" ON maintenance_completions FOR DELETE TO anon USING (true);

-- ========== 008: PDF-Anhänge + Storage ==========

CREATE TABLE IF NOT EXISTS machine_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes BIGINT,
  title TEXT,
  analysis_summary TEXT,
  analysis_metadata JSONB NOT NULL DEFAULT '{}',
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_attachments_machine ON machine_attachments (machine_id, created_at DESC);

ALTER TABLE machine_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read attachments" ON machine_attachments;
DROP POLICY IF EXISTS "Auth write attachments" ON machine_attachments;
DROP POLICY IF EXISTS "Anon read attachments" ON machine_attachments;
DROP POLICY IF EXISTS "Anon insert attachments" ON machine_attachments;
DROP POLICY IF EXISTS "Anon update attachments" ON machine_attachments;
DROP POLICY IF EXISTS "Anon delete attachments" ON machine_attachments;

CREATE POLICY "Auth read attachments" ON machine_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write attachments" ON machine_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read attachments" ON machine_attachments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert attachments" ON machine_attachments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update attachments" ON machine_attachments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete attachments" ON machine_attachments FOR DELETE TO anon USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('machine-documents', 'machine-documents', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Auth read machine docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth insert machine docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete machine docs" ON storage.objects;
DROP POLICY IF EXISTS "Anon read machine docs" ON storage.objects;
DROP POLICY IF EXISTS "Anon insert machine docs" ON storage.objects;
DROP POLICY IF EXISTS "Anon delete machine docs" ON storage.objects;

CREATE POLICY "Auth read machine docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'machine-documents');
CREATE POLICY "Auth insert machine docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'machine-documents');
CREATE POLICY "Auth delete machine docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'machine-documents');
CREATE POLICY "Anon read machine docs" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'machine-documents');
CREATE POLICY "Anon insert machine docs" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'machine-documents');
CREATE POLICY "Anon delete machine docs" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'machine-documents');

-- Fertig – Maschinen anlegen, Termine & PDF-Upload sollten jetzt funktionieren.
