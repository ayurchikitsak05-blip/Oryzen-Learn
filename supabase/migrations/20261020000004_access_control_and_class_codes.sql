-- Access status, direct checkout, and class invite codes.
-- Promote an instructor with:
--   update public.profiles set role = 'instructor' where email = 'teacher@school.edu';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sponsored_code_id UUID;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('student', 'instructor', 'admin'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_access_status_check
    CHECK (access_status IN ('none', 'active_paid', 'class_sponsored', 'trial', 'revoked'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.class_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seat_limit INTEGER,
  seats_used INTEGER NOT NULL DEFAULT 0,
  revoked BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_id UUID REFERENCES public.class_invite_codes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  amount_inr INTEGER NOT NULL,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_instructor
  ON public.class_enrollments(instructor_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user
  ON public.checkout_sessions(user_id);

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_access_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_access_update', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.role := OLD.role;
    NEW.access_status := OLD.access_status;
    NEW.access_granted_at := OLD.access_granted_at;
    NEW.sponsored_code_id := OLD.sponsored_code_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_access_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_access_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_access_columns();

CREATE OR REPLACE FUNCTION public.complete_direct_checkout(session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.checkout_sessions%ROWTYPE;
BEGIN
  SELECT * INTO sess FROM public.checkout_sessions WHERE id = session_id;
  IF sess.id IS NULL OR sess.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Checkout session not found';
  END IF;
  IF sess.status = 'paid' THEN
    RETURN jsonb_build_object('access_status', 'active_paid');
  END IF;
  IF sess.status <> 'pending' THEN
    RAISE EXCEPTION 'Checkout session is not pending';
  END IF;

  PERFORM set_config('app.allow_access_update', 'on', true);
  UPDATE public.checkout_sessions
    SET status = 'paid', paid_at = now()
    WHERE id = session_id;
  UPDATE public.profiles
    SET access_status = 'active_paid',
        access_granted_at = now()
    WHERE id = auth.uid();
  RETURN jsonb_build_object('access_status', 'active_paid');
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_class_invite(invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
  invite public.class_invite_codes%ROWTYPE;
  existing_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  normalized := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  SELECT * INTO invite FROM public.class_invite_codes WHERE code = normalized;
  IF invite.id IS NULL THEN
    RAISE EXCEPTION 'Class code not found';
  END IF;
  IF invite.revoked THEN
    RAISE EXCEPTION 'This class code has been turned off';
  END IF;
  IF invite.expires_at IS NOT NULL AND invite.expires_at <= now() THEN
    RAISE EXCEPTION 'This class code has expired';
  END IF;
  IF invite.seat_limit IS NOT NULL AND invite.seats_used >= invite.seat_limit THEN
    RAISE EXCEPTION 'This class code has no seats left';
  END IF;

  SELECT status INTO existing_status
  FROM public.class_enrollments
  WHERE instructor_id = invite.created_by
    AND student_id = auth.uid();

  INSERT INTO public.class_enrollments (instructor_id, student_id, code_id, status)
  VALUES (invite.created_by, auth.uid(), invite.id, 'active')
  ON CONFLICT (instructor_id, student_id)
  DO UPDATE SET status = 'active', code_id = EXCLUDED.code_id;

  IF existing_status IS DISTINCT FROM 'active' THEN
    UPDATE public.class_invite_codes
      SET seats_used = seats_used + 1
      WHERE id = invite.id;
  END IF;

  PERFORM set_config('app.allow_access_update', 'on', true);
  UPDATE public.profiles
    SET access_status = 'class_sponsored',
        access_granted_at = now(),
        sponsored_code_id = invite.id
    WHERE id = auth.uid()
      AND access_status IS DISTINCT FROM 'active_paid';

  RETURN jsonb_build_object('access_status', 'class_sponsored');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_class_invite(label TEXT, seat_limit INTEGER, invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created public.class_invite_codes%ROWTYPE;
BEGIN
  IF public.current_user_role() NOT IN ('instructor', 'admin') THEN
    RAISE EXCEPTION 'Instructor access required';
  END IF;
  INSERT INTO public.class_invite_codes (code, label, created_by, seat_limit)
  VALUES (
    upper(regexp_replace(invite_code, '[^A-Za-z0-9]', '', 'g')),
    nullif(trim(label), ''),
    auth.uid(),
    CASE WHEN seat_limit IS NULL OR seat_limit < 1 THEN NULL ELSE seat_limit END
  )
  RETURNING * INTO created;
  RETURN jsonb_build_object(
    'id', created.id,
    'code', created.code,
    'label', created.label,
    'seat_limit', created.seat_limit,
    'seats_used', created.seats_used
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_instructor_roster()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('instructor', 'admin') THEN
    RAISE EXCEPTION 'Instructor access required';
  END IF;
  RETURN jsonb_build_object(
    'codes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'label', c.label,
        'seat_limit', c.seat_limit,
        'seats_used', c.seats_used,
        'revoked', c.revoked
      ) ORDER BY c.created_at DESC)
      FROM public.class_invite_codes c
      WHERE c.created_by = auth.uid() OR public.current_user_role() = 'admin'
    ), '[]'::jsonb),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'enrollment_id', e.id,
        'student_id', p.id,
        'email', p.email,
        'full_name', p.full_name,
        'access_status', p.access_status,
        'enrollment_status', e.status
      ) ORDER BY e.created_at DESC)
      FROM public.class_enrollments e
      JOIN public.profiles p ON p.id = e.student_id
      WHERE e.instructor_id = auth.uid() OR public.current_user_role() = 'admin'
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_student_class_access(student UUID, next_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('instructor', 'admin') THEN
    RAISE EXCEPTION 'Instructor access required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE student_id = student
      AND (instructor_id = auth.uid() OR public.current_user_role() = 'admin')
  ) THEN
    RAISE EXCEPTION 'Student is not in this class';
  END IF;

  SELECT access_status INTO current_status FROM public.profiles WHERE id = student;
  PERFORM set_config('app.allow_access_update', 'on', true);

  IF next_action = 'grant' THEN
    UPDATE public.class_enrollments
      SET status = 'active'
      WHERE student_id = student
        AND (instructor_id = auth.uid() OR public.current_user_role() = 'admin');
    UPDATE public.profiles
      SET access_status = 'class_sponsored',
          access_granted_at = now()
      WHERE id = student
        AND access_status IS DISTINCT FROM 'active_paid';
    RETURN jsonb_build_object('access_status', 'class_sponsored');
  END IF;

  IF next_action = 'revoke' THEN
    UPDATE public.class_enrollments
      SET status = 'revoked'
      WHERE student_id = student
        AND (instructor_id = auth.uid() OR public.current_user_role() = 'admin');
    IF current_status IS DISTINCT FROM 'active_paid' THEN
      UPDATE public.profiles
        SET access_status = 'revoked'
        WHERE id = student;
    END IF;
    RETURN jsonb_build_object('access_status', CASE WHEN current_status = 'active_paid' THEN 'active_paid' ELSE 'revoked' END);
  END IF;

  RAISE EXCEPTION 'Action must be grant or revoke';
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_student_by_email(student_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  student public.profiles%ROWTYPE;
BEGIN
  IF public.current_user_role() NOT IN ('instructor', 'admin') THEN
    RAISE EXCEPTION 'Instructor access required';
  END IF;
  SELECT * INTO student
  FROM public.profiles
  WHERE lower(email) = lower(trim(student_email));
  IF student.id IS NULL THEN
    RAISE EXCEPTION 'No account exists for that email yet';
  END IF;

  INSERT INTO public.class_enrollments (instructor_id, student_id, status)
  VALUES (auth.uid(), student.id, 'active')
  ON CONFLICT (instructor_id, student_id)
  DO UPDATE SET status = 'active';

  PERFORM set_config('app.allow_access_update', 'on', true);
  UPDATE public.profiles
    SET access_status = 'class_sponsored',
        access_granted_at = now()
    WHERE id = student.id
      AND access_status IS DISTINCT FROM 'active_paid';

  RETURN jsonb_build_object('student_id', student.id, 'email', student.email);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_direct_checkout(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_class_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_class_invite(TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_instructor_roster() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_student_class_access(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_student_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_direct_checkout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_class_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_class_invite(TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_instructor_roster() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_class_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_student_by_email(TEXT) TO authenticated;

ALTER TABLE public.class_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own pending checkout" ON public.checkout_sessions;
CREATE POLICY "Users insert own pending checkout"
  ON public.checkout_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND amount_inr = 199
    AND provider IN ('placeholder', 'stripe', 'razorpay')
  );

DROP POLICY IF EXISTS "Users read own checkout" ON public.checkout_sessions;
CREATE POLICY "Users read own checkout"
  ON public.checkout_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Instructors read sponsored students" ON public.profiles;
CREATE POLICY "Instructors read sponsored students"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_enrollments e
      WHERE e.student_id = profiles.id
        AND e.instructor_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );
