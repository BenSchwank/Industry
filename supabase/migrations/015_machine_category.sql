-- Kategorie für Maschinenliste (Maschine / Gerät / Kran …)

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_machines_category
  ON public.machines (category);

COMMENT ON COLUMN public.machines.category IS
  'Kategorie z.B. Maschine, Gerät, Kran, Anlage, Werkzeug, Sonstiges';
