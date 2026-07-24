-- Fotos an persönlichen Notizen
-- Einmal im Supabase SQL-Editor ausführen (setzt user_notes voraus).

CREATE TABLE IF NOT EXISTS public.user_note_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.user_notes(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_note_photos_note
  ON public.user_note_photos (note_id, created_at ASC);

ALTER TABLE public.user_note_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Note photos select visible" ON public.user_note_photos;
DROP POLICY IF EXISTS "Note photos insert own" ON public.user_note_photos;
DROP POLICY IF EXISTS "Note photos delete own" ON public.user_note_photos;

CREATE POLICY "Note photos select visible" ON public.user_note_photos
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_notes n
      WHERE n.id = note_id AND (n.owner_id = auth.uid() OR n.is_public = true)
    )
  );

CREATE POLICY "Note photos insert own" ON public.user_note_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_notes n
      WHERE n.id = note_id AND n.owner_id = auth.uid()
    )
  );

CREATE POLICY "Note photos delete own" ON public.user_note_photos
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

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
