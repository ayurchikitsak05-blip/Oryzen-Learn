-- =============================================================================
-- Student Pro renews automatically every month (owner, 11 Nov 2026).
-- Razorpay Subscriptions charges ₹149 each month (UPI AutoPay or card). Razorpay tells the
-- server about each charge; the server moves pro_until forward. When a subscription stops
-- (cancelled or payments failing), Pro continues until pro_until and then returns to Free.
--
-- profiles.pro_until: Pro is paid until this time (NULL = no end, e.g. older test accounts).
-- profiles.razorpay_subscription_id / subscription_status: the student's subscription.
-- Students can't write any of these; only the server (service role).
-- razorpay_events: each notice from Razorpay, once (so a repeated notice isn't applied twice).
--
-- Safe to re-run. Preview first; Production with the owner's approval and the matching app.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT;

CREATE OR REPLACE FUNCTION public.protect_profile_billing_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.pro_until := NULL;
    NEW.razorpay_subscription_id := NULL;
    NEW.subscription_status := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.pro_until := OLD.pro_until;
    NEW.razorpay_subscription_id := OLD.razorpay_subscription_id;
    NEW.subscription_status := OLD.subscription_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_billing_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_billing_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_billing_columns();

CREATE INDEX IF NOT EXISTS idx_profiles_razorpay_subscription
  ON public.profiles (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.razorpay_events (
  event_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  subscription_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.razorpay_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.razorpay_events FROM anon, authenticated;
GRANT ALL ON public.razorpay_events TO service_role;

-- When Pro has run out (pro_until passed and no new charge), the student's own session moves
-- them back to Free on their next visit. It can only ever move the caller down, never up.
CREATE OR REPLACE FUNCTION public.expire_my_pro()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed INTEGER;
BEGIN
  PERFORM set_config('app.allow_access_update', 'on', true);
  UPDATE public.profiles
    SET access_status = 'trial'
    WHERE id = auth.uid()
      AND access_status = 'active_paid'
      AND pro_until IS NOT NULL
      AND pro_until < now();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_my_pro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_my_pro() FROM anon;
GRANT EXECUTE ON FUNCTION public.expire_my_pro() TO authenticated;
