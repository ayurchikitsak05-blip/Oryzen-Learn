-- Database acceptance test for 20261103000001_lock_paid_access_and_profile_columns.sql.
-- Runs in CI against a throwaway local Supabase database. Every check acts as a real
-- signed-in student (role authenticated + JWT claims) and must be refused.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'student.a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'student.b@test.local', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES ('33333333-3333-3333-3333-333333333333', 'Test Institute', 'test-institute')
ON CONFLICT (id) DO NOTHING;

-- A pending checkout for student A, created by the app.
INSERT INTO public.checkout_sessions (id, user_id, provider, status, amount_inr)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'razorpay', 'pending', 199);

DO $$
DECLARE
  out text := '';
  failures int := 0;
  st text;
  r public.profiles%ROWTYPE;
  q public.user_subscriptions_and_quotas%ROWTYPE;
BEGIN
  -- Act as student A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- T1: old self-service checkout completion is gone.
  BEGIN
    PERFORM public.complete_direct_checkout('44444444-4444-4444-4444-444444444444');
    out := out || 'T1 complete_direct_checkout: ALLOWED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'T1 complete_direct_checkout: denied; ';
  END;

  -- T2: the new server-only function is not callable by a student.
  BEGIN
    PERFORM public.complete_verified_checkout('44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111', 'razorpay', NULL);
    out := out || 'T2 complete_verified_checkout: ALLOWED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'T2 complete_verified_checkout: denied; ';
  END;

  -- T3: updating own access / role / institute is silently ignored.
  UPDATE public.profiles
    SET access_status = 'active_paid', role = 'admin',
        organization_id = '33333333-3333-3333-3333-333333333333'
    WHERE id = '11111111-1111-1111-1111-111111111111';
  SELECT * INTO r FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  IF r.access_status = 'active_paid' OR r.role = 'admin' OR r.organization_id IS NOT NULL THEN
    out := out || format('T3 self-update: CHANGED (BAD: %s/%s/%s); ', r.access_status, r.role, r.organization_id);
    failures := failures + 1;
  ELSE
    out := out || 'T3 self-update of access/role/institute: ignored; ';
  END IF;

  -- T4: plan tier and booster balance cannot be raised by the student.
  INSERT INTO public.user_subscriptions_and_quotas (user_id, plan_tier, booster_explanations_remaining)
    VALUES ('11111111-1111-1111-1111-111111111111', 'exam_pass_6mo', 500)
    ON CONFLICT (user_id) DO UPDATE SET plan_tier = 'exam_pass_6mo', booster_explanations_remaining = 500;
  SELECT * INTO q FROM public.user_subscriptions_and_quotas WHERE user_id = '11111111-1111-1111-1111-111111111111';
  IF q.plan_tier <> 'free' OR q.booster_explanations_remaining <> 0 THEN
    out := out || format('T4 plan self-upgrade: CHANGED (BAD: %s/%s); ', q.plan_tier, q.booster_explanations_remaining);
    failures := failures + 1;
  ELSE
    out := out || 'T4 plan/booster self-upgrade: ignored; ';
  END IF;

  -- T5: usage counters still work for metering.
  UPDATE public.user_subscriptions_and_quotas SET daily_explanations_used = 3
    WHERE user_id = '11111111-1111-1111-1111-111111111111';
  SELECT * INTO q FROM public.user_subscriptions_and_quotas WHERE user_id = '11111111-1111-1111-1111-111111111111';
  IF q.daily_explanations_used <> 3 THEN
    out := out || 'T5 usage counter: NOT SAVED (BAD); '; failures := failures + 1;
  ELSE
    out := out || 'T5 usage counter: saved; ';
  END IF;

  -- Act as student B (whose auto-created profile we remove first, as the server would).
  RESET ROLE;
  DELETE FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- T6: a fresh profile insert cannot start as admin / paid / in an institute.
  INSERT INTO public.profiles (id, email, role, access_status, organization_id)
    VALUES ('22222222-2222-2222-2222-222222222222', 'student.b@test.local', 'admin', 'active_paid',
            '33333333-3333-3333-3333-333333333333');
  SELECT * INTO r FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
  IF r.access_status <> 'none' OR r.role <> 'student' OR r.organization_id IS NOT NULL THEN
    out := out || format('T6 profile insert: PRIVILEGED (BAD: %s/%s/%s); ', r.access_status, r.role, r.organization_id);
    failures := failures + 1;
  ELSE
    out := out || 'T6 privileged profile insert: reset to student/none; ';
  END IF;

  -- Server path: the service role completes a verified checkout.
  RESET ROLE;
  SET LOCAL ROLE service_role;

  -- T7: provider mismatch is refused.
  BEGIN
    PERFORM public.complete_verified_checkout('44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111', 'stripe', NULL);
    out := out || 'T7 provider mismatch: ACCEPTED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN raise_exception THEN out := out || 'T7 provider mismatch: refused; ';
  END;

  -- T8: another student's checkout id is refused.
  BEGIN
    PERFORM public.complete_verified_checkout('44444444-4444-4444-4444-444444444444',
      '22222222-2222-2222-2222-222222222222', 'razorpay', NULL);
    out := out || 'T8 wrong student: ACCEPTED (BAD); '; failures := failures + 1;
  EXCEPTION WHEN raise_exception THEN out := out || 'T8 wrong student: refused; ';
  END;

  -- T9: the verified checkout grants access and records the payment reference.
  PERFORM public.complete_verified_checkout('44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111', 'razorpay', 'pay_TEST123');
  RESET ROLE;
  SELECT access_status INTO st FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  IF st <> 'active_paid' OR NOT EXISTS (
    SELECT 1 FROM public.checkout_sessions
    WHERE id = '44444444-4444-4444-4444-444444444444' AND status = 'paid' AND payment_reference = 'pay_TEST123'
  ) THEN
    out := out || format('T9 verified checkout: DID NOT GRANT (BAD: %s); ', st); failures := failures + 1;
  ELSE
    out := out || 'T9 verified checkout: granted and recorded; ';
  END IF;

  -- T10: retrying the same verified checkout is safe.
  SET LOCAL ROLE service_role;
  PERFORM public.complete_verified_checkout('44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111', 'razorpay', 'pay_TEST123');
  RESET ROLE;
  out := out || 'T10 retry: safe; ';

  RAISE NOTICE 'ACCESS LOCK RESULTS: %', out;
  IF failures > 0 THEN
    RAISE EXCEPTION 'ACCESS LOCK TEST FAILED (% failures): %', failures, out;
  END IF;
END $$;

ROLLBACK;
