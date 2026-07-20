-- Dev-Policies: Anon-Zugriff für Prototyp (App nutzt noch keinen Login)
-- Im Supabase SQL Editor ausführen, damit die App Daten laden kann.

CREATE POLICY "Anon read machines" ON machines FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read tickets" ON tickets FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read inventory_items" ON inventory_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read inventory_batches" ON inventory_batches FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read maintenance_tasks" ON maintenance_tasks FOR SELECT TO anon USING (true);
