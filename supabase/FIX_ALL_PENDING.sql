-- Alle offenenlichen Schema-Erweiterungen für die Online-App (einmal im SQL-Editor ausführen)

-- 1) profiles + Freigaben (falls noch nicht)
-- siehe FIX_USER_PROFILES.sql / FIX_ADMIN_USER_ROLES.sql

-- 2) Wer hat den Eintrag gemacht
ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lifecycle_created_by
  ON public.machine_lifecycle_entries (created_by);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by
  ON public.tickets (created_by);

-- 3) Wartungsdauer / nächste Fälligkeit im Lebenszyklus
ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS duration_days INTEGER;

ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS next_due_date DATE;

-- 4) Kategorie (Maschine / Gerät / Kran …)
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_machines_category
  ON public.machines (category);

-- Danach ggf. Schema-Cache neu laden: Dashboard → Settings → API → Reload schema
-- oder kurz warten / Projekt neu laden.
