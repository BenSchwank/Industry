-- PDF-Dokumente pro Maschine (Storage + Metadaten + Analyse)

CREATE TABLE machine_attachments (
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

CREATE INDEX idx_machine_attachments_machine ON machine_attachments (machine_id, created_at DESC);

ALTER TABLE machine_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read attachments" ON machine_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write attachments" ON machine_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read attachments" ON machine_attachments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert attachments" ON machine_attachments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update attachments" ON machine_attachments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete attachments" ON machine_attachments FOR DELETE TO anon USING (true);

-- Storage-Bucket für PDFs (privat, max 50 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('machine-documents', 'machine-documents', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage-Policies (Dev + Auth)
CREATE POLICY "Auth read machine docs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'machine-documents');

CREATE POLICY "Auth insert machine docs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'machine-documents');

CREATE POLICY "Auth delete machine docs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'machine-documents');

CREATE POLICY "Anon read machine docs" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'machine-documents');

CREATE POLICY "Anon insert machine docs" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'machine-documents');

CREATE POLICY "Anon delete machine docs" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'machine-documents');
