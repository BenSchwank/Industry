-- Alle offenenlichen Schema-Erweiterungen für die Online-App (einmal im SQL-Editor ausführen)

-- 1) profiles + Freigaben (falls noch nicht)
-- siehe FIX_USER_PROFILES.sql / FIX_ADMIN_USER_ROLES.sql

-- 2) Wer hat den Eintrag gemacht
ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lifecycle_created_by
  ON public.machine_lifecycle_entries (created_by);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by
  ON public.tickets (created_by);

-- 3) Wartungsdauer / nächste Fälligkeit im Lebenszyklus
ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS duration_days INTEGER;

ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS next_due_date DATE;

-- 4) Kategorie (Maschine / Gerät / Kran …)
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_machines_category
  ON public.machines (category);

-- 5) Persistierte Kategorie- & Standort-Vorschläge
CREATE TABLE IF NOT EXISTS public.machine_field_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_type TEXT NOT NULL CHECK (field_type IN ('category', 'location')),
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT machine_field_options_unique UNIQUE (field_type, value)
);

CREATE INDEX IF NOT EXISTS idx_machine_field_options_type
  ON public.machine_field_options (field_type);

ALTER TABLE public.machine_field_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read field options" ON public.machine_field_options;
DROP POLICY IF EXISTS "Auth write field options" ON public.machine_field_options;
DROP POLICY IF EXISTS "Anon read field options" ON public.machine_field_options;
DROP POLICY IF EXISTS "Anon write field options" ON public.machine_field_options;

CREATE POLICY "Auth read field options" ON public.machine_field_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write field options" ON public.machine_field_options
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read field options" ON public.machine_field_options
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write field options" ON public.machine_field_options
  FOR ALL TO anon USING (true) WITH CHECK (true);

INSERT INTO public.machine_field_options (field_type, value)
SELECT DISTINCT 'category', trim(category)
FROM public.machines
WHERE category IS NOT NULL AND trim(category) <> ''
ON CONFLICT (field_type, value) DO NOTHING;

INSERT INTO public.machine_field_options (field_type, value)
SELECT DISTINCT 'location', trim(location)
FROM public.machines
WHERE location IS NOT NULL AND trim(location) <> ''
ON CONFLICT (field_type, value) DO NOTHING;

-- 6) Aufgaben löschen (Reparaturen-Seite)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_tasks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_checklist_items TO anon, authenticated;

DROP POLICY IF EXISTS "Anon delete maintenance_tasks" ON public.maintenance_tasks;
CREATE POLICY "Anon delete maintenance_tasks" ON public.maintenance_tasks
  FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon delete checklist_items" ON public.maintenance_checklist_items;
CREATE POLICY "Anon delete checklist_items" ON public.maintenance_checklist_items
  FOR DELETE TO anon USING (true);

-- Danach ggf. Schema-Cache neu laden: Dashboard → Settings → API → Reload schema
-- oder kurz warten / Projekt neu laden.

-- 7) Anzeigename Zeichnung/Menü getrennt vom Datenname (Lebenszyklus)
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS label_name TEXT;

COMMENT ON COLUMN public.machines.label_name IS
  'Anzeigename aus Zeichnung/Menü/Etikett. name bleibt der Datenname für Lebenszyklus & Scan.';

CREATE INDEX IF NOT EXISTS idx_machines_label_name
  ON public.machines (label_name)
  WHERE label_name IS NOT NULL;

-- 8) Externe IDs (QS1 / Import) – nötig für Listen-Select mit external_source
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'kwd';

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'kwd';

CREATE UNIQUE INDEX IF NOT EXISTS idx_machines_external
  ON public.machines (external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external
  ON public.maintenance_tasks (external_source, external_id)
  WHERE external_id IS NOT NULL;

-- 9) Schneidöl / Hydrauliköl / Codes vom Wartungsplan-Aushang
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_cutting_oil_at DATE;
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS next_cutting_oil_at DATE;
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_hydraulic_oil_at DATE;
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS next_hydraulic_oil_at DATE;
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_maintenance_code TEXT;
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS next_maintenance_code TEXT;
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_hydraulic_code TEXT;

-- 10) Lebenszyklus-Fotos (Tabelle + Storage-Bucket)
CREATE TABLE IF NOT EXISTS public.machine_lifecycle_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.machine_lifecycle_entries(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_photos_entry
  ON public.machine_lifecycle_photos (entry_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_lifecycle_photos_machine
  ON public.machine_lifecycle_photos (machine_id, created_at DESC);

ALTER TABLE public.machine_lifecycle_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read lifecycle photos" ON public.machine_lifecycle_photos;
DROP POLICY IF EXISTS "Auth write lifecycle photos" ON public.machine_lifecycle_photos;
DROP POLICY IF EXISTS "Anon read lifecycle photos" ON public.machine_lifecycle_photos;
DROP POLICY IF EXISTS "Anon write lifecycle photos" ON public.machine_lifecycle_photos;

CREATE POLICY "Auth read lifecycle photos" ON public.machine_lifecycle_photos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write lifecycle photos" ON public.machine_lifecycle_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read lifecycle photos" ON public.machine_lifecycle_photos
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write lifecycle photos" ON public.machine_lifecycle_photos
  FOR ALL TO anon USING (true) WITH CHECK (true);

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

-- 11) Störungs-Fotos
-- Fotos zu Störungen (Tickets)

CREATE TABLE IF NOT EXISTS public.ticket_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  machine_id UUID REFERENCES public.machines(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_photos_ticket
  ON public.ticket_photos (ticket_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ticket_photos_machine
  ON public.ticket_photos (machine_id, created_at DESC);

ALTER TABLE public.ticket_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read ticket photos" ON public.ticket_photos;
DROP POLICY IF EXISTS "Auth write ticket photos" ON public.ticket_photos;
DROP POLICY IF EXISTS "Anon read ticket photos" ON public.ticket_photos;
DROP POLICY IF EXISTS "Anon write ticket photos" ON public.ticket_photos;

CREATE POLICY "Auth read ticket photos" ON public.ticket_photos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write ticket photos" ON public.ticket_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read ticket photos" ON public.ticket_photos
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write ticket photos" ON public.ticket_photos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Gleicher Bucket wie Lebenszyklus-Fotos (falls noch nicht vorhanden)
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

-- 12) Unterlagen: Bilder im Dokumenten-Bucket (optional)
-- Unterlagen: auch Bilder im Dokumenten-Bucket erlauben (optional, falls genutzt)
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ],
  file_size_limit = 52428800
WHERE id = 'machine-documents';

-- 13) Störung ↔ Lebenszyklus-Reparatur
-- Störung optional mit Lebenszyklus-Eintrag (Reparatur) verknüpfen
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS lifecycle_entry_id UUID
  REFERENCES public.machine_lifecycle_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_lifecycle_entry
  ON public.tickets (lifecycle_entry_id)
  WHERE lifecycle_entry_id IS NOT NULL;

