# Projekt auf Vercel online stellen

Die App ist ein **Vite + React** Frontend. Die Datenbank bleibt bei **Supabase**. Vercel hostet nur die Website.

---

## Voraussetzungen

1. Code auf **GitHub** (oder GitLab/Bitbucket) – Repo mit diesem Projekt pushen  
2. Account auf [vercel.com](https://vercel.com) (mit GitHub verbinden)  
3. Deine Supabase-Werte bereit:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`  
   (aus Supabase → Project Settings → API)

---

## Schritte in Vercel

### 1. Neues Projekt anlegen
1. Vercel Dashboard → **Add New…** → **Project**
2. Dein GitHub-Repo **Industry** auswählen → **Import**

### 2. Framework & Build (meist automatisch)
| Einstellung | Wert |
|-------------|------|
| Framework Preset | **Vite** |
| Root Directory | `.` (Projektroot) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### 3. Environment Variables (wichtig)
Unter **Environment Variables** für **Production** (und Preview) eintragen:

| Name | Wert |
|------|------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | dein `anon` / `publishable` Key |

Optional, falls genutzt:
| `VITE_OPENAI_API_KEY` | … |
| `VITE_USE_EDGE_AI` | `false` |

**Nicht** den `service_role` Key hier eintragen – der gehört nur auf den Server / Secrets bei KWD.

### 4. Deploy
**Deploy** klicken. Nach dem Build bekommst du eine URL wie `https://industry-xxx.vercel.app`.

### 5. Supabase für die Online-URL freigeben
In Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** deine Vercel-URL (z. B. `https://industry-xxx.vercel.app`)
- **Redirect URLs:** dieselbe URL (+ ggf. `http://localhost:5173` für lokal)

Ohne das können Login/Registrierung von Vercel aus scheitern.

### 6. SQL-Migrationen auf Prod
Im Supabase SQL Editor einmalig alle offenen FIX_/Migrationen ausführen, u. a.:
- `FIX_USER_PROFILES.sql`
- `FIX_ADMIN_USER_ROLES.sql`
- `FIX_CREATED_BY.sql`
- (Fotos, Attachments, … je nach Bedarf)

---

## Nach dem Deploy prüfen

1. Website öffnen → Anmelden mit `admin_kwd`  
2. Tab **Nutzer** sichtbar  
3. Eine Test-Wartung eintragen → Benutzername erscheint im Verlauf  
4. Handy: URL als PWA speichern (optional)

---

## Custom Domain (optional, für KWD)

Vercel → Project → **Settings** → **Domains** → z. B. `instandhaltung.kwd-dresden.de` eintragen und DNS bei KWD setzen.  
Danach Site URL in Supabase Auth auf die Domain umstellen.

---

## Wichtige Hinweise

- Jeder Push auf den verbundenen Branch (meist `main`) löst einen neuen Deploy aus.  
- Preview-Deployments für Pull Requests sind möglich – Env-Vars auch für Preview setzen.  
- Die Daten liegen weiter nur in **Supabase** (KWD-Projekt), nicht bei Vercel.  
- Dev-Modus „Ohne Anmeldung“ ist in Production ausgeblendet (`import.meta.env.DEV`).

---

*Kurz: GitHub → Vercel Import → Vite → Env `VITE_SUPABASE_*` → Deploy → Auth Site URL in Supabase setzen.*
