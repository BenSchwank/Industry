-- Schneidöl / Hydrauliköl / Wartungs-Codes vom Aushang (bestehende Daten bleiben)

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_cutting_oil_at DATE;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS next_cutting_oil_at DATE;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_hydraulic_oil_at DATE;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS next_hydraulic_oil_at DATE;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_maintenance_code TEXT;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS next_maintenance_code TEXT;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_hydraulic_code TEXT;

COMMENT ON COLUMN public.machines.last_cutting_oil_at IS 'Letzter Schneidöl-Wechsel';
COMMENT ON COLUMN public.machines.next_cutting_oil_at IS 'Nächster geplanter Schneidöl-Wechsel';
COMMENT ON COLUMN public.machines.last_hydraulic_oil_at IS 'Letzter Hydrauliköl-Wechsel';
COMMENT ON COLUMN public.machines.next_hydraulic_oil_at IS 'Nächster Hydrauliköl-Wechsel';
COMMENT ON COLUMN public.machines.last_maintenance_code IS 'E=extern / I=intern / IB=Inbetriebnahme';
COMMENT ON COLUMN public.machines.next_maintenance_code IS 'E/I nächste Wartung';
COMMENT ON COLUMN public.machines.last_hydraulic_code IS 'W / IB / K';
