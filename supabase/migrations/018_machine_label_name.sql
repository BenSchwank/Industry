-- Anzeigename / Zeichnung (Menü) vs. Datenname (Lebenszyklus)

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS label_name TEXT;

COMMENT ON COLUMN public.machines.label_name IS
  'Anzeigename aus Zeichnung/Menü/Etikett. name bleibt der Datenname für Lebenszyklus & Scan.';

CREATE INDEX IF NOT EXISTS idx_machines_label_name
  ON public.machines (label_name)
  WHERE label_name IS NOT NULL;
