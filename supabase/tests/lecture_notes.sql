-- Database acceptance test for 20261104000001_lecture_notes.sql.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'student.a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'student.b@test.local', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- The server writes a shared lecture and one request row for each student.
SET LOCAL ROLE service_role;
INSERT INTO public.lecture_notes_cache (video_id, title, notes, model_used)
  VALUES ('dQw4w9WgXcQ', 'Test lecture', '[]'::jsonb, 'gemini-3.5-flash-lite');
INSERT INTO public.lecture_note_requests (user_id, video_id, cost_inr)
  VALUES ('11111111-1111-1111-1111-111111111111', 'dQw4w9WgXcQ', 4.5),
         ('22222222-2222-2222-2222-222222222222', 'dQw4w9WgXcQ', 0);
RESET ROLE;

DO $$
DECLARE
  out text := '';
  failures int := 0;
  n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- L1: a student can read shared lecture notes.
  SELECT count(*) INTO n FROM public.lecture_notes_cache WHERE video_id = 'dQw4w9WgXcQ';
  IF n <> 1 THEN out := out || 'L1 read shared notes: NOT VISIBLE (BAD); '; failures := failures + 1;
  ELSE out := out || 'L1 read shared notes: ok; '; END IF;

  -- L2: a student cannot write or change shared notes.
  BEGIN
    INSERT INTO public.lecture_notes_cache (video_id, notes, model_used) VALUES ('aaaaaaaaaaa', '[]', 'x');
    out := out || 'L2 insert notes: ALLOWED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'L2 insert notes: denied; ';
  END;
  BEGIN
    UPDATE public.lecture_notes_cache SET title = 'hacked' WHERE video_id = 'dQw4w9WgXcQ';
    out := out || 'L3 update notes: ALLOWED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'L3 update notes: denied; ';
  END;

  -- L4: a student sees only their own request rows.
  SELECT count(*) INTO n FROM public.lecture_note_requests;
  IF n <> 1 THEN out := out || format('L4 own requests: saw %s rows (BAD); ', n); failures := failures + 1;
  ELSE out := out || 'L4 own requests only: ok; '; END IF;

  -- L5: a student cannot delete or add request rows (no resetting the monthly count).
  BEGIN
    DELETE FROM public.lecture_note_requests WHERE user_id = '11111111-1111-1111-1111-111111111111';
    out := out || 'L5 delete own requests: ALLOWED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'L5 delete own requests: denied; ';
  END;
  BEGIN
    INSERT INTO public.lecture_note_requests (user_id, video_id) VALUES ('11111111-1111-1111-1111-111111111111', 'x');
    out := out || 'L6 insert request: ALLOWED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'L6 insert request: denied; ';
  END;

  RESET ROLE;
  RAISE NOTICE 'LECTURE NOTES RESULTS: %', out;
  IF failures > 0 THEN
    RAISE EXCEPTION 'LECTURE NOTES TEST FAILED (% failures): %', failures, out;
  END IF;
END $$;

ROLLBACK;
