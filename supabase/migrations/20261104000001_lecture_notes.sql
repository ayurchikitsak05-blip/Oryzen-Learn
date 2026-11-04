-- YouTube lecture notes (3–4 Nov 2026).
-- 1. lecture_notes_cache: one set of AI notes per public YouTube video, shared by every
--    student (the first student pays; everyone after gets them free). Only the server
--    (service role) reads and writes it; students get notes through the app's server,
--    so they never see who added a video or what it cost.
-- 2. lecture_note_requests: one row per student request, used to count new lectures per
--    month. Students can read their own rows but cannot add, change or delete rows, so
--    they cannot reset their own count.

CREATE TABLE IF NOT EXISTS public.lecture_notes_cache (
  video_id TEXT PRIMARY KEY CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title TEXT NOT NULL DEFAULT '',
  notes JSONB NOT NULL,
  covered_seconds INTEGER NOT NULL DEFAULT 0 CHECK (covered_seconds >= 0),
  model_used TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  cost_inr NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (cost_inr >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lecture_note_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  cost_inr NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (cost_inr >= 0),
  -- false when the AI's answer was cut short: the cost is kept, but the student isn't charged a lecture.
  counted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lecture_note_requests_user_created
  ON public.lecture_note_requests (user_id, created_at);

ALTER TABLE public.lecture_notes_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_note_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lecture_notes_cache FROM anon, authenticated;
REVOKE ALL ON public.lecture_note_requests FROM anon, authenticated;
GRANT SELECT ON public.lecture_note_requests TO authenticated;
GRANT ALL ON public.lecture_notes_cache TO service_role;
GRANT ALL ON public.lecture_note_requests TO service_role;

DROP POLICY IF EXISTS lecture_note_requests_read_own ON public.lecture_note_requests;
CREATE POLICY lecture_note_requests_read_own ON public.lecture_note_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
