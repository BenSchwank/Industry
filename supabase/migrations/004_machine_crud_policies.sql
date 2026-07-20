-- Maschinen: Schreibzugriff für Anlegen/Bearbeiten (Dev + Auth)
CREATE POLICY "Anon insert machines" ON machines FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update machines" ON machines FOR UPDATE TO anon USING (true) WITH CHECK (true);
