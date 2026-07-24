# Schema-Deploy (Supabase)

## Ein Befehl für Production

Im **Supabase SQL Editor** einmal ausführen:

1. Inhalt von [`supabase/FIX_ALL_PENDING.sql`](../supabase/FIX_ALL_PENDING.sql) (enthält alle FIX-Skripte inkl. Ticket-Art `kind` und Notizen)
2. Oder gezielt nur neue Spalten: [`supabase/FIX_TICKET_KIND.sql`](../supabase/FIX_TICKET_KIND.sql)
3. Nur Notizen: [`supabase/FIX_USER_NOTES.sql`](../supabase/FIX_USER_NOTES.sql)

Migrations unter `supabase/migrations/` sind die kanonische Historie (001–027).  
Die `FIX_*.sql`-Dateien sind **idempotente** Nachzüge für bestehende Produktiv-DBs.

## Ticket-Art (`kind`)

| Wert | Bedeutung |
|------|-----------|
| `issue` | Normale Störung (bleibt unter Störungen) |
| `planned_repair` | Geplante Reparatur (Reparaturen-Tab) |

Fallback in der App: Beschreibung beginnt mit `[Geplante Reparatur]`, falls die Spalte noch fehlt.

## Persönliche Notizen (`user_notes`)

| Feld | Bedeutung |
|------|-----------|
| `owner_id` | Besitzer (nur der darf ändern/löschen) |
| `is_public` | `false` = privat · `true` = alle authentifizierten Nutzer dürfen lesen |

## Nach dem Deploy

1. Schema Cache in Supabase ggf. neu laden (API neu starten / kurz warten)
2. App neu laden und eine geplante Reparatur anlegen
3. Prüfen: erscheint unter **Reparaturen**, nicht unter **Störungen**
4. Unter **Notizen** eine Notiz anlegen und auf **Öffentlich** stellen
