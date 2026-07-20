-- Dauer und nächste Fälligkeit an Verlaufs-Wartungen

ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS duration_days INTEGER;

ALTER TABLE public.machine_lifecycle_entries
  ADD COLUMN IF NOT EXISTS next_due_date DATE;

COMMENT ON COLUMN public.machine_lifecycle_entries.duration_days IS
  'Intervall in Tagen (vor allem bei Wartung)';
COMMENT ON COLUMN public.machine_lifecycle_entries.next_due_date IS
  'Nächste Wartung = occurred_at + duration_days';
