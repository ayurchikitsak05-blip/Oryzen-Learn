-- PENDING — do not apply to shared / Preview / Production
-- Project ref mazzciufouqcxmwaacyu is out of scope until explicit approval.
-- Local demo uses localStorage + /api/roadmap fallback when this table is missing.

-- =============================================================================
-- APPLY (review only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.study_roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  intake jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  completions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_roadmaps_user ON public.study_roadmaps(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_study_roadmaps_updated_at ON public.study_roadmaps;
CREATE TRIGGER trg_study_roadmaps_updated_at
  BEFORE UPDATE ON public.study_roadmaps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.study_roadmaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their study roadmaps" ON public.study_roadmaps;
CREATE POLICY "Users manage their study roadmaps"
  ON public.study_roadmaps
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_roadmaps TO authenticated;
