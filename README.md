# KWD Instandhaltung

Shopfloor-App für Kupplungswerke Dresden: Maschinen, Störungen, Reparaturen/HU, Scanner, Lager, Team-Chat, Hinweise/Fälligkeiten.

## Entwicklung

```bash
npm install
npm run dev
npm run build
```

## Schema / Production

Siehe **[docs/SCHEMA_DEPLOY.md](docs/SCHEMA_DEPLOY.md)** – einmal `supabase/FIX_ALL_PENDING.sql` im Supabase SQL Editor ausführen (inkl. Ticket-Art `kind` und Notizen).

Weitere Übergabe: [docs/KWD_UEBERGABE_CHECKLISTE.md](docs/KWD_UEBERGABE_CHECKLISTE.md), [docs/VERCEL_DEPLOY.md](docs/VERCEL_DEPLOY.md).
