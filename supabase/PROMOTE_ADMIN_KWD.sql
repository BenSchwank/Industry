-- Admin-Konto per Hand (wenn App-Registrierung wegen Rate-Limit scheitert):
--
-- 1) Supabase Dashboard → Authentication → Users → "Add user"
--    E-Mail:    admin_kwd@kwd-auth.example.com
--    Passwort:  Kwd!Adm9x#mP7qR2vL
--    Auto Confirm User: AN
--
-- 2) Diesen SQL-Block ausführen (Profil anlegen + Admin freischalten):

INSERT INTO public.profiles (id, username, role, status, activated_at)
SELECT
  u.id,
  'admin_kwd',
  'admin',
  'active',
  now()
FROM auth.users u
WHERE lower(u.email) = 'admin_kwd@kwd-auth.example.com'
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  role = 'admin',
  status = 'active',
  activated_at = now();

-- Kontrolle:
SELECT id, username, role, status, activated_at
FROM public.profiles
WHERE username = 'admin_kwd';
