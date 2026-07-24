# Schema-Deploy (Supabase)

## Ein Befehl für Production

Im **Supabase SQL Editor** einmal ausführen:

1. Inhalt von [`supabase/FIX_ALL_PENDING.sql`](../supabase/FIX_ALL_PENDING.sql) (alles inkl. Ticket-Art, Notizen, Maschinenwissen, Notiz-Fotos)
2. Oder gezielt:
   - [`supabase/FIX_TICKET_KIND.sql`](../supabase/FIX_TICKET_KIND.sql)
   - [`supabase/FIX_USER_NOTES.sql`](../supabase/FIX_USER_NOTES.sql)
   - [`supabase/FIX_MACHINE_KNOWLEDGE.sql`](../supabase/FIX_MACHINE_KNOWLEDGE.sql)
   - [`supabase/FIX_NOTE_PHOTOS.sql`](../supabase/FIX_NOTE_PHOTOS.sql)

Migrations unter `supabase/migrations/` sind die kanonische Historie (001–029).  
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

Fotos: Tabelle `user_note_photos` (Bucket `machine-lifecycle-media`, Pfad `notes/{ownerId}/{noteId}/…`).  
SQL: [`FIX_NOTE_PHOTOS.sql`](../supabase/FIX_NOTE_PHOTOS.sql).

## Maschinenwissen (`machine_knowledge_pages`)

Pro Maschine mehrere **Seiten/Dokumente** (Titel + Text), gespeichert in der Cloud – nicht mehr nur lokal.

| Aktion | Verhalten |
|--------|-----------|
| Speichern | Autosave + Button „Speichern“; gilt auch im **Vollbild** der Maschinenakte |
| Umbenennen | Titel im Eingabefeld tippen |
| Neue Seite | „+ Seite“ |
| Löschen | Seite entfernen (mindestens eine bleibt) |
| Migration | Alter localStorage-Text wird einmalig als erste Seite übernommen |

SQL: [`FIX_MACHINE_KNOWLEDGE.sql`](../supabase/FIX_MACHINE_KNOWLEDGE.sql).

## Nach dem Deploy

1. Schema Cache in Supabase ggf. neu laden (API neu starten / kurz warten)
2. App neu laden
3. **Maschinenakte → Wissen**: Seite anlegen, speichern, Vollbild prüfen
4. **Notizen**: Foto anhängen
5. **Störungen**: „Vergrößern“ öffnen, Foto anhängen
