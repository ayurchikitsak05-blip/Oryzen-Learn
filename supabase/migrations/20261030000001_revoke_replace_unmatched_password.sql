-- P0: remove account-takeover password RPC.
-- replace_unmatched_password was SECURITY DEFINER and executable by anon +
-- authenticated with no ownership proof. Drop it entirely; do not keep a
-- weakened fallback. Password recovery must use Supabase Auth email flows.

DO $$
BEGIN
  IF to_regprocedure('public.replace_unmatched_password(text, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.replace_unmatched_password(text, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.replace_unmatched_password(text, text) FROM anon;
    REVOKE ALL ON FUNCTION public.replace_unmatched_password(text, text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.replace_unmatched_password(text, text) FROM service_role;
    DROP FUNCTION public.replace_unmatched_password(text, text);
  END IF;
END
$$;
