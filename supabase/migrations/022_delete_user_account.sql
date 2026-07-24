-- Nutzerkonto vollständig löschen (nur Admins)

CREATE OR REPLACE FUNCTION public.delete_user_account(target_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  other_admins integer;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Nur freigegebene Admins dürfen Nutzer löschen';
  END IF;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Benutzer fehlt';
  END IF;

  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'Eigenes Konto kann nicht gelöscht werden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_id) THEN
    RAISE EXCEPTION 'Profil nicht gefunden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = target_id AND role = 'admin' AND status = 'active'
  ) THEN
    SELECT count(*) INTO other_admins
    FROM public.profiles
    WHERE role = 'admin' AND status = 'active' AND id <> target_id;

    IF other_admins < 1 THEN
      RAISE EXCEPTION 'Der letzte Admin kann nicht gelöscht werden';
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = target_id;

  IF NOT FOUND THEN
    DELETE FROM public.profiles WHERE id = target_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account(UUID) TO authenticated;
