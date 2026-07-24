# Schema-Deploy (Supabase)

## Ein Befehl für Production

Im **Supabase SQL Editor** einmal ausführen:

1. Inhalt von [`supabase/FIX_ALL_PENDING.sql`](../supabase/FIX_ALL_PENDING.sql) (enthält alle FIX-Skripte inkl. Ticket-Art `kind`)
2. Oder gezielt nur neue Spalten: [`supabase/FIX_TICKET_KIND.sql`](../supabase/FIX_TICKET_KIND.sql)

Migrations unter `supabase/migrations/` sind die kanonische Historie (001–026).  
Die `FIX_*.sql`-Dateien sind **idempotente** Nachzüge für bestehende Produktiv-DBs.

## Ticket-Art (`kind`)

| Wert | Bedeutung |
|------|-----------|
| `issue` | Normale Störung (bleibt unter Störungen) |
| `planned_repair` | Geplante Reparatur (Reparaturen-Tab) |

Fallback in der App: Beschreibung beginnt mit `[Geplante Reparatur]`, falls die Spalte noch fehlt.

## Nach dem Deploy

1. Schema Cache in Supabase ggf. neu laden (API neu starten / kurz warten)
2. App neu laden und eine geplante Reparatur anlegen
3. Prüfen: erscheint unter **Reparaturen**, nicht unter **Störungen**
