-- =============================================================================
-- Parental consent for students under 18 (DPDP Act 2023, section 9; DPDP Rules 2025, rule 10)
-- 11 Nov 2026. The duty applies from 14 May 2027; ORYZEN starts it early.
--
-- 1. profiles.birth_month: month and year of birth (stored as the 1st of the month).
--    profiles.parent_consent_at: when a parent agreed (NULL = no consent, or withdrawn).
--    Students can't write either column themselves; only the server (service role) can,
--    after its checks. A date of birth, once given, can only be changed by support.
-- 2. parental_consents: one row per consent request, kept as the record of consent
--    (who agreed, when, to which notice version, and how they were checked).
--    Students and parents can read their own rows; only the server writes.
--
-- Safe to re-run. Apply to Preview first; Production only with the owner's approval,
-- together with the app code that uses it.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_month DATE,
  ADD COLUMN IF NOT EXISTS parent_consent_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_birth_month_first_day;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_birth_month_first_day
  CHECK (birth_month IS NULL OR (EXTRACT(DAY FROM birth_month) = 1 AND birth_month >= DATE '1900-01-01'));

CREATE OR REPLACE FUNCTION public.protect_profile_age_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only end users coming through the public API are restricted.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.birth_month := NULL;
    NEW.parent_consent_at := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.birth_month := OLD.birth_month;
    NEW.parent_consent_at := OLD.parent_consent_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_age_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_age_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_age_columns();

CREATE TABLE IF NOT EXISTS public.parental_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Only a hash of the link's secret is kept.
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'granted', 'withdrawn', 'replaced')),
  parent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_email TEXT,
  parent_name TEXT,
  relationship TEXT CHECK (relationship IS NULL OR relationship IN ('mother', 'father', 'guardian')),
  -- How the parent was checked to be an identifiable adult (rule 10). Today: their own signed-in,
  -- email-verified account with a date of birth showing 18+, plus a declaration. DigiLocker later.
  verification_method TEXT,
  notice_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_parental_consents_child ON public.parental_consents (child_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parental_consents_parent ON public.parental_consents (parent_user_id);

ALTER TABLE public.parental_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parental_consents FROM anon, authenticated;
GRANT SELECT (id, child_user_id, status, parent_user_id, parent_name, relationship, created_at, expires_at, granted_at, withdrawn_at)
  ON public.parental_consents TO authenticated;
GRANT ALL ON public.parental_consents TO service_role;

DROP POLICY IF EXISTS "read own consent records" ON public.parental_consents;
CREATE POLICY "read own consent records" ON public.parental_consents
  FOR SELECT TO authenticated
  USING (child_user_id = auth.uid() OR parent_user_id = auth.uid());
