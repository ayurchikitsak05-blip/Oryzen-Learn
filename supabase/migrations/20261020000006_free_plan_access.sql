-- Let a signed-in student choose the free tier without self-editing access columns.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_access_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('none', 'free', 'active_paid', 'class_sponsored', 'trial', 'revoked'));

CREATE OR REPLACE FUNCTION public.activate_free_plan()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT access_status INTO current_status
  FROM public.profiles
  WHERE id = auth.uid();

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF current_status IN ('free', 'active_paid', 'class_sponsored', 'trial') THEN
    RETURN jsonb_build_object('access_status', current_status);
  END IF;

  PERFORM set_config('app.allow_access_update', 'on', true);
  UPDATE public.profiles
    SET access_status = 'free',
        access_granted_at = now()
    WHERE id = auth.uid();

  RETURN jsonb_build_object('access_status', 'free');
END;
$$;

REVOKE ALL ON FUNCTION public.activate_free_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_free_plan() TO authenticated;
