-- Störung optional mit Lebenszyklus-Eintrag (Reparatur) verknüpfen
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS lifecycle_entry_id UUID
  REFERENCES public.machine_lifecycle_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_lifecycle_entry
  ON public.tickets (lifecycle_entry_id)
  WHERE lifecycle_entry_id IS NOT NULL;
