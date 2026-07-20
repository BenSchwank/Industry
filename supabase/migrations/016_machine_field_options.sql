-- Persistierte Kategorie- und Standort-Vorschläge (bleiben auch ohne Maschinen erhalten)

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

-- Bestehende Werte aus Maschinen übernehmen (einmalig befüllen)
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
