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
