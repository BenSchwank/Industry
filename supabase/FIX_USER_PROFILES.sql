-- Benutzerprofile: Registrierung mit Benutzername, Freigabe durch Admin

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uname text;
  make_admin boolean;
BEGIN
  uname := lower(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')));
  IF uname IS NULL OR uname = '' THEN
    uname := lower(split_part(NEW.email, '@', 1));
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = uname) THEN
    uname := uname || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;

  -- Erster Nutzer ohne Admin → sofort Admin (Bootstrap)
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE role = 'admin' AND status = 'active'
  ) INTO make_admin;

  INSERT INTO public.profiles (id, username, role, status, activated_at)
  VALUES (
    NEW.id,
    uname,
    CASE WHEN make_admin THEN 'admin' ELSE 'user' END,
    CASE WHEN make_admin THEN 'active' ELSE 'pending' END,
    CASE WHEN make_admin THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users update own limited" ON public.profiles;
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_active_admin());

CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- RPC: Konto freigeben / ablehnen (nur aktive Admins)
CREATE OR REPLACE FUNCTION public.set_profile_status(
  target_id UUID,
  new_status TEXT
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.profiles;
BEGIN
  IF new_status NOT IN ('pending', 'active', 'rejected') THEN
    RAISE EXCEPTION 'Ungültiger Status';
  END IF;

  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Nur freigegebene Admins dürfen Konten aktivieren';
  END IF;

  UPDATE public.profiles
  SET
    status = new_status,
    activated_at = CASE WHEN new_status = 'active' THEN now() ELSE activated_at END,
    activated_by = CASE WHEN new_status = 'active' THEN auth.uid() ELSE activated_by END
  WHERE id = target_id
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Profil nicht gefunden';
  END IF;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_profile_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

-- Bestehende Auth-User ohne Profil nachziehen (einmalig)
INSERT INTO public.profiles (id, username, role, status, activated_at)
SELECT
  u.id,
  lower(COALESCE(NULLIF(trim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1))),
  'user',
  'pending',
  NULL
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
