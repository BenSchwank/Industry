-- Störung: Zuständiger Benutzer + lesbare aktive Profile für die Auswahl

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_to UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to
  ON public.tickets (assigned_to)
  WHERE assigned_to IS NOT NULL;

DROP POLICY IF EXISTS "Auth read active profiles" ON public.profiles;
CREATE POLICY "Auth read active profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (status = 'active' OR id = auth.uid() OR public.is_active_admin());
