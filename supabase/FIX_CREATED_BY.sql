-- Wer hat den Eintrag gemacht (Verlauf / Störungen)

ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lifecycle_created_by
  ON public.machine_lifecycle_entries (created_by);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by
  ON public.tickets (created_by);
