-- =============================================================================
-- Record a lecture (group B, 10 Nov 2026)
-- A private bucket where a student's class recording waits while the AI reads it.
-- The server creates a one-time upload link for users/<student id>/<recording>.<ext>,
-- reads the file with the service role, then deletes it. Students can't list or read
-- the bucket, and nothing is public. Notes count in lecture_note_requests (no new table).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lecture-audio',
  'lecture-audio',
  FALSE,
  52428800, -- 50 MB (the Supabase Free plan's upload limit); about 90 minutes at the app's recording rate
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No storage.objects policies for this bucket on purpose: uploads use a one-time signed
-- link made by the server, and only the server (service role) reads and deletes files.

-- Finished notes wait here briefly, so a student whose phone lost the connection (or locked)
-- while notes were being made gets them on the next try instead of paying for a second lecture.
-- Only the server reads and writes this table; a row is removed once the student has the notes,
-- and the server clears rows older than 7 days.
CREATE TABLE IF NOT EXISTS public.lecture_recording_results (
  recording_id TEXT PRIMARY KEY CHECK (recording_id ~ '^rec-[0-9a-f-]{36}$'),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  notes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lecture_recording_results_user
  ON public.lecture_recording_results (user_id, created_at);

ALTER TABLE public.lecture_recording_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lecture_recording_results FROM anon, authenticated;
GRANT ALL ON public.lecture_recording_results TO service_role;
