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
