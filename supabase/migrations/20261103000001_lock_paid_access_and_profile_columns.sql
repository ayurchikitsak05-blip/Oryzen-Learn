-- Lock paid access, plan tiers and institute membership to the server.
--
-- Problems this closes (found in the 3 Nov 2026 launch audit):
--   1. Any signed-in student could call complete_direct_checkout() directly with the public
--      key and become 'active_paid' without paying (the payment checks lived only in the app).
--   2. A brand-new profile row could be inserted with role = 'admin' or access_status = 'active_paid'
--      (the protection trigger only ran on UPDATE).
--   3. A student could set profiles.organization_id to any institute and read its files.
--   4. A student could set their own plan_tier and booster balances.
--
-- Safe to re-run. Apply to Preview first, then Production with the owner's approval,
-- and deploy the matching app code (completeVerifiedCheckout) at the same time:
-- once this runs, old app code can no longer complete checkouts.

-- -----------------------------------------------------------------------------
-- 1. Payment completion only from the server (service role) after verification.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_verified_checkout(
  p_session_id UUID,
  p_user_id UUID,
  p_provider TEXT,
  p_provider_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.checkout_sessions%ROWTYPE;
BEGIN
  SELECT * INTO sess FROM public.checkout_sessions WHERE id = p_session_id FOR UPDATE;
  IF sess.id IS NULL OR sess.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Checkout session not found';
  END IF;
  IF sess.provider IS DISTINCT FROM p_provider THEN
    RAISE EXCEPTION 'Checkout provider does not match';
  END IF;
  IF sess.status = 'paid' THEN
    RETURN jsonb_build_object('access_status', 'active_paid', 'already_paid', true);
  END IF;
  IF sess.status <> 'pending' THEN
    RAISE EXCEPTION 'Checkout session is not pending';
  END IF;

  PERFORM set_config('app.allow_access_update', 'on', true);
  UPDATE public.checkout_sessions
    SET status = 'paid', paid_at = now(),
        payment_reference = COALESCE(p_provider_reference, payment_reference)
    WHERE id = p_session_id;
  UPDATE public.profiles
    SET access_status = 'active_paid',
        access_granted_at = now()
    WHERE id = p_user_id;
  RETURN jsonb_build_object('access_status', 'active_paid');
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_checkout(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_verified_checkout(UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_checkout(UUID, UUID, TEXT, TEXT) TO service_role;

-- The old student-callable function is no longer used by the app.
REVOKE ALL ON FUNCTION public.complete_direct_checkout(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_direct_checkout(UUID) FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2 & 3. Profiles: students cannot set role, access, or institute membership,
-- on INSERT as well as UPDATE. Server code (service role), SECURITY DEFINER
-- functions and the SQL editor are not affected.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_access_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_access_update', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Only end users coming through the public API are restricted.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.role := 'student';
    NEW.access_status := 'none';
    NEW.access_granted_at := NULL;
    NEW.sponsored_code_id := NULL;
    NEW.organization_id := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.role := OLD.role;
    NEW.access_status := OLD.access_status;
    NEW.access_granted_at := OLD.access_granted_at;
    NEW.sponsored_code_id := OLD.sponsored_code_id;
    NEW.organization_id := OLD.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_access_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_access_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_access_columns();

-- -----------------------------------------------------------------------------
-- 4. Plan tier and booster balances: read-only for students.
-- Usage counters stay writable so the existing quota metering keeps working.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_subscription_plan_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.plan_tier := 'free';
    NEW.booster_packs_purchased := 0;
    NEW.booster_explanations_remaining := 0;
    NEW.booster_quizzes_remaining := 0;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.plan_tier := OLD.plan_tier;
    NEW.booster_packs_purchased := OLD.booster_packs_purchased;
    -- Balances may only go down (spending a booster), never up.
    NEW.booster_explanations_remaining :=
      LEAST(NEW.booster_explanations_remaining, OLD.booster_explanations_remaining);
    NEW.booster_quizzes_remaining :=
      LEAST(NEW.booster_quizzes_remaining, OLD.booster_quizzes_remaining);
  END IF;
  RETURN NEW;
END;
$$;

-- Named so it runs before trg_enforce_and_reset_daily_user_quotas (triggers fire in name order).
DROP TRIGGER IF EXISTS trg_0_protect_subscription_plan_columns ON public.user_subscriptions_and_quotas;
CREATE TRIGGER trg_0_protect_subscription_plan_columns
  BEFORE INSERT OR UPDATE ON public.user_subscriptions_and_quotas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_subscription_plan_columns();
