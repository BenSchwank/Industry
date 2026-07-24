-- Ticket-Art: Störung vs. geplante Reparatur (statt Text-Marker in der Beschreibung)
-- Einmal im Supabase SQL-Editor ausführen (oder über FIX_ALL_PENDING.sql).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'issue';

DO $$
BEGIN
  ALTER TABLE public.tickets
    DROP CONSTRAINT IF EXISTS tickets_kind_check;
  ALTER TABLE public.tickets
    ADD CONSTRAINT tickets_kind_check
    CHECK (kind IN ('issue', 'planned_repair'));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Bestehende geplante Reparaturen aus Marker / Verknüpfung nachziehen
UPDATE public.tickets
SET kind = 'planned_repair'
WHERE kind = 'issue'
  AND (
    description LIKE '[Geplante Reparatur]%'
    OR lifecycle_entry_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_tickets_kind ON public.tickets (kind);
CREATE INDEX IF NOT EXISTS idx_tickets_kind_status ON public.tickets (kind, status);
