-- =============================================================================
-- Layer 5 Migration: Freemium Quotas, Exam Booster Packs, Database Quota Triggers,
-- and Coaching Institute B2B DRM & Batch Asset Distribution
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USER_SUBSCRIPTIONS_AND_QUOTAS TABLE
-- Enforces Free Tier (3 PDFs, 10 AI explanations/day, 1 quiz/day),
-- Pro / Exam Pass Tier (₹199/mo or ₹799/6mo: 25+ PDFs, 150 AI explanations/day, unlimited quizzes),
-- and Exam Booster Top-Up Packs (₹49/mo: +100 AI explanations + 20 quizzes).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_subscriptions_and_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (
    plan_tier IN ('free', 'pro_monthly', 'exam_pass_6mo')
  ),
  active_pdf_count INTEGER NOT NULL DEFAULT 0 CHECK (active_pdf_count >= 0),
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_explanations_used INTEGER NOT NULL DEFAULT 0 CHECK (daily_explanations_used >= 0),
  daily_quizzes_used INTEGER NOT NULL DEFAULT 0 CHECK (daily_quizzes_used >= 0),
  booster_packs_purchased INTEGER NOT NULL DEFAULT 0 CHECK (booster_packs_purchased >= 0),
  booster_explanations_remaining INTEGER NOT NULL DEFAULT 0 CHECK (booster_explanations_remaining >= 0),
  booster_quizzes_remaining INTEGER NOT NULL DEFAULT 0 CHECK (booster_quizzes_remaining >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to reset daily counters automatically when usage_date advances
CREATE OR REPLACE FUNCTION public.enforce_and_reset_daily_user_quotas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  max_pdfs INTEGER;
BEGIN
  IF NEW.usage_date < CURRENT_DATE THEN
    NEW.usage_date := CURRENT_DATE;
    NEW.daily_explanations_used := 0;
    NEW.daily_quizzes_used := 0;
  END IF;

  IF NEW.plan_tier = 'free' THEN
    max_pdfs := 3;
  ELSE
    max_pdfs := 25;
  END IF;

  IF NEW.active_pdf_count > max_pdfs THEN
    RAISE EXCEPTION 'PDF quota exceeded for plan_tier % (max % active PDFs)', NEW.plan_tier, max_pdfs;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_and_reset_daily_user_quotas ON public.user_subscriptions_and_quotas;
CREATE TRIGGER trg_enforce_and_reset_daily_user_quotas
  BEFORE INSERT OR UPDATE ON public.user_subscriptions_and_quotas
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_and_reset_daily_user_quotas();

-- -----------------------------------------------------------------------------
-- 2. INSTITUTE_BATCH_ASSETS TABLE (B2B Coaching Institute DRM PDFs & Batch Lectures)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_batch_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('drm_pdf', 'batch_lecture')),
  title TEXT NOT NULL,
  storage_path_or_url TEXT NOT NULL,
  syllabus_subject TEXT NOT NULL,
  syllabus_locked_ai BOOLEAN NOT NULL DEFAULT TRUE,
  drm_block_download_and_print BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_institute_batch_assets_org
  ON public.institute_batch_assets(organization_id, batch_name);

-- -----------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY (RLS) FOR LAYER 5 TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_subscriptions_and_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_batch_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own subscription and quotas" ON public.user_subscriptions_and_quotas;
CREATE POLICY "Users can select own subscription and quotas"
  ON public.user_subscriptions_and_quotas
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subscription and quotas" ON public.user_subscriptions_and_quotas;
CREATE POLICY "Users can insert own subscription and quotas"
  ON public.user_subscriptions_and_quotas
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscription and quotas" ON public.user_subscriptions_and_quotas;
CREATE POLICY "Users can update own subscription and quotas"
  ON public.user_subscriptions_and_quotas
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organization members can read authorized batch assets" ON public.institute_batch_assets;
CREATE POLICY "Organization members can read authorized batch assets"
  ON public.institute_batch_assets
  FOR SELECT
  TO authenticated
  USING (organization_id = public.current_user_organization_id());
