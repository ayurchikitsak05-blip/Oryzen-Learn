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
  62914560, -- 60 MB, about 90 minutes of phone audio
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No storage.objects policies for this bucket on purpose: uploads use a one-time signed
-- link made by the server, and only the server (service role) reads and deletes files.
