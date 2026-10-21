CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.replace_unmatched_password(target_email text, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  found_id uuid;
BEGIN
  IF target_email IS NULL OR length(btrim(target_email)) = 0 OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'A valid email and a password of at least 8 characters are required';
  END IF;

  SELECT id INTO found_id
  FROM auth.users
  WHERE lower(email) = lower(btrim(target_email));

  IF found_id IS NULL THEN
    RAISE EXCEPTION 'No account uses that email';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = found_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_unmatched_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_unmatched_password(text, text) TO anon, authenticated;
