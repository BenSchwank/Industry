-- Maschinenwissen: mehrere Seiten pro Maschine (in der Cloud gespeichert)
-- Einmal im Supabase SQL-Editor ausführen.

CREATE TABLE IF NOT EXISTS public.machine_knowledge_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Neue Seite',
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_knowledge_machine
  ON public.machine_knowledge_pages (machine_id, sort_order ASC, updated_at DESC);

ALTER TABLE public.machine_knowledge_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read machine knowledge" ON public.machine_knowledge_pages;
DROP POLICY IF EXISTS "Auth write machine knowledge" ON public.machine_knowledge_pages;
DROP POLICY IF EXISTS "Anon read machine knowledge" ON public.machine_knowledge_pages;
DROP POLICY IF EXISTS "Anon write machine knowledge" ON public.machine_knowledge_pages;

CREATE POLICY "Auth read machine knowledge" ON public.machine_knowledge_pages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write machine knowledge" ON public.machine_knowledge_pages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read machine knowledge" ON public.machine_knowledge_pages
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon write machine knowledge" ON public.machine_knowledge_pages
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_machine_knowledge_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_machine_knowledge_updated_at ON public.machine_knowledge_pages;
CREATE TRIGGER trg_machine_knowledge_updated_at
  BEFORE UPDATE ON public.machine_knowledge_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_machine_knowledge_updated_at();
