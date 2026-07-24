-- Persönliche Notizen (privat / öffentlich teilbar)
-- Einmal im Supabase SQL-Editor ausführen (oder FIX_USER_NOTES.sql)

CREATE TABLE IF NOT EXISTS public.user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Neue Notiz',
  body TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_owner
  ON public.user_notes (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notes_public
  ON public.user_notes (is_public, updated_at DESC)
  WHERE is_public = true;

ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notes select own or public" ON public.user_notes;
DROP POLICY IF EXISTS "Notes insert own" ON public.user_notes;
DROP POLICY IF EXISTS "Notes update own" ON public.user_notes;
DROP POLICY IF EXISTS "Notes delete own" ON public.user_notes;

CREATE POLICY "Notes select own or public" ON public.user_notes
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_public = true);

CREATE POLICY "Notes insert own" ON public.user_notes
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Notes update own" ON public.user_notes
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Notes delete own" ON public.user_notes
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_user_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_notes_updated_at ON public.user_notes;
CREATE TRIGGER trg_user_notes_updated_at
  BEFORE UPDATE ON public.user_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_notes_updated_at();
