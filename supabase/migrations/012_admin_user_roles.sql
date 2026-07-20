-- Admin: Nutzerrolle setzen (user/admin)

CREATE OR REPLACE FUNCTION public.set_profile_role(
  target_id UUID,
  new_role TEXT
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.profiles;
  other_admins integer;
BEGIN
  IF new_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'Ungültige Rolle';
  END IF;

  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Nur freigegebene Admins dürfen Rollen ändern';
  END IF;

  IF new_role = 'user' THEN
    SELECT count(*) INTO other_admins
    FROM public.profiles
    WHERE role = 'admin' AND status = 'active' AND id <> target_id;

    IF other_admins < 1 AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = target_id AND role = 'admin' AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Der letzte Admin kann nicht entfernt werden';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    role = new_role,
    status = CASE WHEN new_role = 'admin' THEN 'active' ELSE status END,
    activated_at = CASE
      WHEN new_role = 'admin' THEN COALESCE(activated_at, now())
      ELSE activated_at
    END,
    activated_by = CASE
      WHEN new_role = 'admin' THEN COALESCE(activated_by, auth.uid())
      ELSE activated_by
    END
  WHERE id = target_id
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Profil nicht gefunden';
  END IF;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_profile_role(UUID, TEXT) TO authenticated;
