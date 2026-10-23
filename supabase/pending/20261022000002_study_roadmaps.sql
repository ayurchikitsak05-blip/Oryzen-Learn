-- PENDING — do not apply to shared / Production.
-- Step 4 BLOCKED until Preview is a separate database from Oryzen Learn-Prod
-- (ref mazzciufouqcxmwaacyu). Do not apply_migration / DDL against that ref.
-- Local demo uses localStorage + /api/roadmap fallback when this table is missing.
--
-- Prerequisite: public.set_updated_at_timestamp() from
--   supabase/migrations/20261020000001_layer1_schema_rls_and_storage.sql
-- Verify before apply:
--   SELECT 1
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'set_updated_at_timestamp';
--
-- Size / complexity:
--   CHECK uses octet_length(jsonb::text) and days-array length (immutable).
--   Sessions-per-day and nested subject/chapter caps are enforced by /api/roadmap
--   (CHECK cannot contain subqueries over jsonb_array_elements).
--
-- =============================================================================
-- APPLY (Preview-isolated database only)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at_timestamp'
  ) THEN
    RAISE EXCEPTION 'public.set_updated_at_timestamp() is required before study_roadmaps';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.study_roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  intake jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  completions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_roadmaps_plan_object CHECK (jsonb_typeof(plan) = 'object'),
  CONSTRAINT study_roadmaps_intake_object CHECK (jsonb_typeof(intake) = 'object'),
  CONSTRAINT study_roadmaps_completions_object CHECK (jsonb_typeof(completions) = 'object'),
  CONSTRAINT study_roadmaps_days_array CHECK (
    jsonb_typeof(COALESCE(plan->'days', '[]'::jsonb)) = 'array'
    AND jsonb_array_length(COALESCE(plan->'days', '[]'::jsonb)) <= 400
  ),
  CONSTRAINT study_roadmaps_payload_size CHECK (
    octet_length(intake::text) + octet_length(plan::text) + octet_length(completions::text) <= 524288
  )
);

CREATE INDEX IF NOT EXISTS idx_study_roadmaps_user ON public.study_roadmaps(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_study_roadmaps_updated_at ON public.study_roadmaps;
CREATE TRIGGER trg_study_roadmaps_updated_at
  BEFORE UPDATE ON public.study_roadmaps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.study_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_roadmaps FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their study roadmaps" ON public.study_roadmaps;
CREATE POLICY "Users manage their study roadmaps"
  ON public.study_roadmaps
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.study_roadmaps FROM PUBLIC;
REVOKE ALL ON TABLE public.study_roadmaps FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_roadmaps TO authenticated;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_study_roadmaps_updated_at ON public.study_roadmaps;
-- DROP POLICY IF EXISTS "Users manage their study roadmaps" ON public.study_roadmaps;
-- DROP TABLE IF EXISTS public.study_roadmaps;
