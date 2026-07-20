# KWD-Übergabe – Checkliste für eine sichere Übertragung

**Zweck:** Diese Checkliste zeigt der Kupplungswerke Dresden (KWD), was der Entwickler bei der Übergabe der Instandhaltungssoftware technisch und organisatorisch erledigen muss, damit **KWD Eigentümer der Daten und der Produktivumgebung** ist und der Entwickler **weiter am Code arbeiten kann**, ohne dauerhaften Zugriff auf Betriebsdaten zu haben.

**Zielbild:** Firma = Supabase-Owner + Dateneigentümer · Entwickler = Code/Staging · Produktivdaten nur mit Freigabe und Protokoll.

---

## 1. Eigentum und Verantwortung (vor dem Go-Live klären)

| # | Aufgabe | Wer | Erledigt |
|---|---------|-----|----------|
| 1.1 | Schriftlich festlegen: **KWD ist Verantwortlicher** der Daten (DSGVO) | KWD + Entwickler | ☐ |
| 1.2 | Falls Entwickler Support leistet: **Auftragsverarbeitungsvertrag (AVV)** abschließen | KWD + Entwickler | ☐ |
| 1.3 | Vereinbaren: Entwickler darf Produktivdaten **nicht** weitergeben, verkaufen oder dauerhaft speichern | KWD + Entwickler | ☐ |
| 1.4 | Vereinbaren: Support-Zugriff nur **zeitlich begrenzt**, auf Anfrage, und nachvollziehbar | KWD + Entwickler | ☐ |
| 1.5 | Lizenz / Eigentum am **Quellcode** klären (wer darf weiterentwickeln, Forks, Sperren) | KWD + Entwickler | ☐ |

---

## 2. Supabase-Projekt der Firma zuordnen

| # | Aufgabe | Wer | Erledigt |
|---|---------|-----|----------|
| 2.1 | Supabase-Organisation unter **KWD-Konto** anlegen (Firmen-E-Mail, nicht Privatadresse des Entwicklers) | KWD IT / Admin | ☐ |
| 2.2 | Produktiv-Projekt in dieser Organisation betreiben (Billing = KWD) | KWD | ☐ |
| 2.3 | Entwickler **nicht** als Owner belassen; höchstens befristete Rolle (z. B. Developer) | KWD | ☐ |
| 2.4 | Nach Übergabe: Owner-Rechte des Entwicklers entfernen bzw. nie vergeben | KWD | ☐ |
| 2.5 | **Service-Role-Key** nur bei KWD hinterlegen (Passwortmanager / Secrets), nie im Frontend, nie im öffentlichen Repo | Entwickler → KWD | ☐ |
| 2.6 | **Anon-/Publishable-Key** darf im Frontend liegen; trotzdem Projekt-URL und Keys nach Handover rotieren, wenn der Entwickler sie früher hatte | KWD | ☐ |

---

## 3. Zwei Welten: Produktion vs. Entwicklung

| # | Aufgabe | Wer | Erledigt |
|---|---------|-----|----------|
| 3.1 | **Produktiv-Supabase** nur für echte Maschinen-/Wartungsdaten | KWD | ☐ |
| 3.2 | Separates **Dev-/Staging-Projekt** (leere oder anonymisierte Testdaten) für Weiterentwicklung | Entwickler | ☐ |
| 3.3 | App-Umgebungen trennen (`.env.production` vs. `.env.development`) – nie Prod-URL in Dev-Builds | Entwickler | ☐ |
| 3.4 | Keine Produktiv-Dumps ungeschützt auf Laptops / USB / Chat kopieren | alle | ☐ |

---

## 4. Zugänge und Benutzerfreigabe (App)

Die App erlaubt Registrierung mit **Benutzername + Passwort**. Neue Konten sind zunächst **`pending`** und haben **keinen** App-Zugang, bis ein Admin freigibt.

| # | Aufgabe | Wer | Erledigt |
|---|---------|-----|----------|
| 4.1 | Migration `011_user_profiles.sql` (bzw. `FIX_USER_PROFILES.sql`) in **Prod** ausführen | KWD / Entwickler einmalig | ☐ |
| 4.2 | In Supabase Auth: **E-Mail-Bestätigung aus** (Login läuft über Benutzername → interne Adresse `@kwd-auth.example.com`) | KWD Admin | ☐ |
| 4.3 | Ersten Admin freischalten (SQL im Dashboard): siehe Abschnitt 8 | KWD | ☐ |
| 4.4 | Weitere Nutzer: Registrierung in der App → Freigabe über Login-Bereich **„Freigaben“** oder Einstellungen | Admin | ☐ |
| 4.5 | **Dev-Modus „Ohne Anmeldung“** in Produktion nicht nutzen / nicht freigeben | KWD | ☐ |
| 4.6 | Anon-Schreibrechte in Prod langfristig einschränken (nur noch eingeloggte, freigegebene Nutzer) | Entwickler + KWD | ☐ |

---

## 5. Secrets, Deploy und Code

| # | Aufgabe | Wer | Erledigt |
|---|---------|-----|----------|
| 5.1 | Git-Repository an KWD übergeben (oder Mirror); Zugänge dokumentieren | Entwickler | ☐ |
| 5.2 | Alle Secrets aus persönlicher Umgebung entfernen, die zu Prod gehören | Entwickler | ☐ |
| 5.3 | Deploy-Pipeline (Hosting) auf KWD-Konto umstellen (Vercel/Netlify/Firmen-Server) | KWD + Entwickler | ☐ |
| 5.4 | Nach Übergabe **neue** Supabase-Keys erzeugen und alte invalidieren, falls der Entwickler sie kannte | KWD | ☐ |
| 5.5 | Storage-Buckets (`machine-documents`, `machine-lifecycle-media`) und Policies prüfen | Entwickler | ☐ |
| 5.6 | Offene Migrationen `001`–`011` (+ FIX_*.sql) einmalig dokumentieren / anwenden | Entwickler | ☐ |

---

## 6. Was der Entwickler danach noch darf / nicht darf

**Darf (typisch):**

- am Quellcode in Git arbeiten  
- gegen **Staging** entwickeln und testen  
- Features liefern, die KWD (oder CI) deployt  
- Support nur nach Freigabe und ohne unnötige Datenkopien  

**Darf nicht (ohne ausdrückliche, befristete Freigabe):**

- Produktivdaten exportieren oder weitergeben  
- Service-Role dauerhaft behalten  
- als Owner des Firmen-Supabase-Projekts bleiben  
- Nutzerkonten ohne Prozess anlegen/umgehen  

---

## 7. Abnahme durch KWD (kurz zeigen)

Bei Übergabe gemeinsam durchgehen:

1. KWD kann sich als Admin anmelden und Nutzer freigeben.  
2. Neuer Testnutzer registriert sich → sieht „wartet auf Freigabe“ → nach Aktivierung Zugang.  
3. Entwickler hat **kein** Owner-Recht mehr am Prod-Projekt (oder nie gehabt).  
4. Staging läuft getrennt; Entwickler zeigt, dass er dort weiterbauen kann.  
5. AVV / Übergabeprotokoll unterschrieben.

---

## 8. Ersten Admin in Supabase freischalten (SQL)

Im Supabase SQL-Editor (nur für berechtigte Admins):

```sql
-- Nachdem du dich einmal in der App registriert hast:
UPDATE public.profiles
SET
  role = 'admin',
  status = 'active',
  activated_at = now()
WHERE username = 'dein_benutzername';
-- Beispiel für den Firmen-Admin:
-- WHERE lower(username) = 'admin_kwd';
```

Weitere Freigaben danach in der App unter **Anmelden → Freigaben** (Admin-Login) oder in den Einstellungen.

Oder Datei ausführen: `supabase/PROMOTE_ADMIN_KWD.sql`

Manuell nur Status setzen (ohne Admin-Rolle):

```sql
UPDATE public.profiles
SET status = 'active', activated_at = now()
WHERE username = 'kollege';
```

---

## 9. Kurzfassung für Entscheider

> Die Software läuft bei KWD in einem **firmeneigenen Supabase-Projekt**.  
> Der Entwickler liefert Code und kann an einer **getrennten Testumgebung** weiterarbeiten.  
> **Produktivdaten** gehören KWD; Zugang nur für freigegebene Mitarbeiterkonten.  
> Neue Mitarbeiter registrieren sich selbst; ein Admin **aktiviert** sie – ohne Aktivierung kein Zugang.

Damit ist die Übergabe **technisch und organisatorisch** so gestaltbar, dass der Entwickler nicht dauerhaft über Firmendaten verfügen muss und KWD die Kontrolle behält.

---

*Dokument im Repository: `docs/KWD_UEBERGABE_CHECKLISTE.md` · Stand: Übergabe-Vorbereitung*
