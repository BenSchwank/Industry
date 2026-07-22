-- Störungen ohne Maschine: freier Bezugspunkt (Halle, Anlage, …)

ALTER TABLE public.tickets
  ALTER COLUMN machine_id DROP NOT NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS reference_label TEXT;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_machine_or_reference_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_machine_or_reference_check
  CHECK (
    machine_id IS NOT NULL
    OR (reference_label IS NOT NULL AND btrim(reference_label) <> '')
  );

CREATE INDEX IF NOT EXISTS idx_tickets_reference_label
  ON public.tickets (reference_label)
  WHERE reference_label IS NOT NULL;

COMMENT ON COLUMN public.tickets.reference_label IS
  'Freier Bezugspunkt wenn keine Maschine zugeordnet ist (z.B. Halle, Förderband).';
