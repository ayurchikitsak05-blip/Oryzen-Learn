-- PENDING — do not apply to shared / Preview / Production
-- Project ref mazzciufouqcxmwaacyu is out of scope until explicit approval.
-- Tested only against a local disposable SQLite mock of the policy predicate.

-- =============================================================================
-- APPLY (review only)
-- =============================================================================

ALTER TABLE public.ai_response_cache
  ADD COLUMN IF NOT EXISTS cache_scope TEXT NOT NULL DEFAULT 'private'
    CHECK (cache_scope IN ('private', 'institute_authorized')),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS revocation_epoch TEXT NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS cache_version TEXT NOT NULL DEFAULT 'oryzen-app-cache-v1';

-- Existing rows were written under USING (true). Treat them as private with
-- no owner so students cannot SELECT the historical shared dump.
UPDATE public.ai_response_cache
SET
  cache_scope = 'private',
  owner_user_id = NULL,
  tenant_id = NULL
WHERE owner_user_id IS NULL
  AND cache_scope = 'private';

DROP POLICY IF EXISTS "Authenticated users can read shared AI response cache"
  ON public.ai_response_cache;
DROP POLICY IF EXISTS "Authenticated users can insert shared AI response cache"
  ON public.ai_response_cache;
DROP POLICY IF EXISTS "Users can read authorized AI response cache"
  ON public.ai_response_cache;
DROP POLICY IF EXISTS "Users can insert authorized AI response cache"
  ON public.ai_response_cache;

CREATE POLICY "Users can read authorized AI response cache"
  ON public.ai_response_cache
  FOR SELECT
  TO authenticated
  USING (
    (
      cache_scope = 'private'
      AND owner_user_id IS NOT NULL
      AND owner_user_id = auth.uid()
    )
    OR (
      cache_scope = 'institute_authorized'
      AND tenant_id IS NOT NULL
      AND tenant_id = public.current_user_organization_id()::text
    )
  );

CREATE POLICY "Users can insert authorized AI response cache"
  ON public.ai_response_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      (
        cache_scope = 'private'
        AND tenant_id IS NULL
      )
      OR (
        cache_scope = 'institute_authorized'
        AND tenant_id IS NOT NULL
        AND tenant_id = public.current_user_organization_id()::text
      )
    )
  );

-- No student UPDATE/DELETE. Gateway service role bypasses RLS.

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP POLICY IF EXISTS "Users can read authorized AI response cache"
--   ON public.ai_response_cache;
-- DROP POLICY IF EXISTS "Users can insert authorized AI response cache"
--   ON public.ai_response_cache;
--
-- CREATE POLICY "Authenticated users can read shared AI response cache"
--   ON public.ai_response_cache
--   FOR SELECT TO authenticated
--   USING (true);
--
-- CREATE POLICY "Authenticated users can insert shared AI response cache"
--   ON public.ai_response_cache
--   FOR INSERT TO authenticated
--   WITH CHECK (true);
--
-- ALTER TABLE public.ai_response_cache
--   DROP COLUMN IF EXISTS cache_scope,
--   DROP COLUMN IF EXISTS owner_user_id,
--   DROP COLUMN IF EXISTS tenant_id,
--   DROP COLUMN IF EXISTS revocation_epoch,
--   DROP COLUMN IF EXISTS cache_version;
