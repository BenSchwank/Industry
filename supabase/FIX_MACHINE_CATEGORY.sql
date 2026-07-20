-- Kategorie für Maschinenliste (einmal im SQL-Editor ausführen)

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_machines_category
  ON public.machines (category);
