-- Fotos zu Verlaufseinträgen (Wartung, Reparatur, …)

CREATE TABLE IF NOT EXISTS machine_lifecycle_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES machine_lifecycle_entries(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_photos_entry
  ON machine_lifecycle_photos (entry_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_lifecycle_photos_machine
  ON machine_lifecycle_photos (machine_id, created_at DESC);

ALTER TABLE machine_lifecycle_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read lifecycle photos" ON machine_lifecycle_photos;
DROP POLICY IF EXISTS "Auth write lifecycle photos" ON machine_lifecycle_photos;
DROP POLICY IF EXISTS "Anon read lifecycle photos" ON machine_lifecycle_photos;
DROP POLICY IF EXISTS "Anon write lifecycle photos" ON machine_lifecycle_photos;

CREATE POLICY "Auth read lifecycle photos" ON machine_lifecycle_photos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write lifecycle photos" ON machine_lifecycle_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read lifecycle photos" ON machine_lifecycle_photos
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write lifecycle photos" ON machine_lifecycle_photos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Storage-Bucket für Bilder (privat, max 12 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'machine-lifecycle-media',
  'machine-lifecycle-media',
  false,
  12582912,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Auth read lifecycle media" ON storage.objects;
DROP POLICY IF EXISTS "Auth insert lifecycle media" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete lifecycle media" ON storage.objects;
DROP POLICY IF EXISTS "Anon read lifecycle media" ON storage.objects;
DROP POLICY IF EXISTS "Anon insert lifecycle media" ON storage.objects;
DROP POLICY IF EXISTS "Anon delete lifecycle media" ON storage.objects;

CREATE POLICY "Auth read lifecycle media" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'machine-lifecycle-media');
CREATE POLICY "Auth insert lifecycle media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'machine-lifecycle-media');
CREATE POLICY "Auth delete lifecycle media" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'machine-lifecycle-media');
CREATE POLICY "Anon read lifecycle media" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'machine-lifecycle-media');
CREATE POLICY "Anon insert lifecycle media" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'machine-lifecycle-media');
CREATE POLICY "Anon delete lifecycle media" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'machine-lifecycle-media');
