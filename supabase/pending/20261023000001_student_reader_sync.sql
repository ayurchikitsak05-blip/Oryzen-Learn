-- Applied to Oryzen Learn Preview (`gxthbneiryvdrsduktza`) only.
-- Do not apply to Production (`mazzciufouqcxmwaacyu`) without approval.

CREATE TABLE IF NOT EXISTS public.student_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id text NOT NULL,
  page_number integer NOT NULL CHECK (page_number > 0 AND page_number < 20000),
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_id, page_number)
);

CREATE TABLE IF NOT EXISTS public.student_quiz_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  progress_key text NOT NULL,
  document_id text NOT NULL,
  document_title text NOT NULL DEFAULT '',
  page_number integer NOT NULL,
  selection_key text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  weak_concepts jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, progress_key)
);

ALTER TABLE public.student_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_quiz_progress ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.student_bookmarks FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.student_quiz_progress FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_bookmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_quiz_progress TO authenticated;

DROP POLICY IF EXISTS student_bookmarks_own ON public.student_bookmarks;
CREATE POLICY student_bookmarks_own ON public.student_bookmarks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS student_quiz_progress_own ON public.student_quiz_progress;
CREATE POLICY student_quiz_progress_own ON public.student_quiz_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
