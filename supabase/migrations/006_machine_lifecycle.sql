-- Maschinen-Lebenslauf: manuelle Einträge (Wartung, Reparatur, Notiz)
CREATE TYPE lifecycle_entry_type AS ENUM ('maintenance', 'repair', 'inspection', 'note');

CREATE TABLE machine_lifecycle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  entry_type lifecycle_entry_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lifecycle_machine ON machine_lifecycle_entries (machine_id, occurred_at DESC);

ALTER TABLE machine_lifecycle_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read lifecycle" ON machine_lifecycle_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write lifecycle" ON machine_lifecycle_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon read lifecycle" ON machine_lifecycle_entries FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert lifecycle" ON machine_lifecycle_entries FOR INSERT TO anon WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE machine_lifecycle_entries;
