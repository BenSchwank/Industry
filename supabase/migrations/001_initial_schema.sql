-- KWD Instandhaltung – Initiales Datenbankschema
-- Ausführen im Supabase SQL Editor (Dashboard → SQL → New query)

-- Enums
CREATE TYPE machine_status AS ENUM ('active', 'maintenance', 'offline', 'decommissioned');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- 1. Maschinen
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT,
  warranty_until DATE,
  status machine_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Störungstickets
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'open',
  priority ticket_priority NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- 3. Lagerartikel (Stammdaten)
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  min_stock_level INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Lagerchargen (FIFO-relevant: received_at, expiry_date)
CREATE TABLE inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  expiry_date DATE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  location TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, batch_number)
);

-- 5. Wartungsaufgaben
CREATE TABLE maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  frequency_days INTEGER NOT NULL CHECK (frequency_days > 0),
  next_due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indizes für schnelle Barcode-Suche & FIFO-Abfragen
CREATE INDEX idx_machines_barcode ON machines (barcode);
CREATE INDEX idx_inventory_items_barcode ON inventory_items (barcode);
CREATE INDEX idx_tickets_machine_id ON tickets (machine_id);
CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_inventory_batches_item_id ON inventory_batches (item_id);
CREATE INDEX idx_inventory_batches_fifo ON inventory_batches (item_id, received_at ASC, expiry_date ASC NULLS LAST);
CREATE INDEX idx_maintenance_tasks_machine_id ON maintenance_tasks (machine_id);
CREATE INDEX idx_maintenance_tasks_due ON maintenance_tasks (next_due_date);

-- updated_at Trigger für machines
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER machines_updated_at
  BEFORE UPDATE ON machines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Realtime für Live-Sync (Android ↔ Windows)
ALTER PUBLICATION supabase_realtime ADD TABLE machines;
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE maintenance_tasks;

-- Row Level Security (Basis: authentifizierte Nutzer)
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read machines" ON machines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write machines" ON machines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read tickets" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write tickets" ON tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read inventory_items" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write inventory_items" ON inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read inventory_batches" ON inventory_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write inventory_batches" ON inventory_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read maintenance_tasks" ON maintenance_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write maintenance_tasks" ON maintenance_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
