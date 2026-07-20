-- KI-Wartungsentwürfe (Draft → manuelle Freigabe → maintenance_tasks)

CREATE TABLE maintenance_plan_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES machine_attachments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  frequency_days INTEGER CHECK (frequency_days IS NULL OR frequency_days > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'active', 'failed')),
  source TEXT NOT NULL DEFAULT 'ai',
  ai_model TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);

CREATE TABLE maintenance_draft_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES maintenance_plan_drafts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_drafts_machine ON maintenance_plan_drafts (machine_id, created_at DESC);
CREATE INDEX idx_draft_items_draft ON maintenance_draft_checklist_items (draft_id, sort_order);

ALTER TABLE maintenance_plan_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_draft_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read drafts" ON maintenance_plan_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write drafts" ON maintenance_plan_drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read drafts" ON maintenance_plan_drafts FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert drafts" ON maintenance_plan_drafts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update drafts" ON maintenance_plan_drafts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete drafts" ON maintenance_plan_drafts FOR DELETE TO anon USING (true);

CREATE POLICY "Auth read draft items" ON maintenance_draft_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write draft items" ON maintenance_draft_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read draft items" ON maintenance_draft_checklist_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert draft items" ON maintenance_draft_checklist_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update draft items" ON maintenance_draft_checklist_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete draft items" ON maintenance_draft_checklist_items FOR DELETE TO anon USING (true);

-- Analyse-Job-Status auf Anhang
ALTER TABLE machine_attachments
  ADD COLUMN IF NOT EXISTS ai_analysis_status TEXT DEFAULT 'none'
    CHECK (ai_analysis_status IN ('none', 'queued', 'processing', 'done', 'failed'));
