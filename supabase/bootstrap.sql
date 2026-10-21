-- Oryzen Learn bootstrap for a project that has auth users but no app tables.
-- Safe to run more than once. Creates profiles first, then checkout, class codes,
-- device lock, and the free-plan function.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  prakriti_profile JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sponsored_code_id UUID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'instructor', 'admin'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_access_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('none', 'free', 'active_paid', 'class_sponsored', 'trial', 'revoked'));

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Confirm email at insert so GoTrue returns a session and does not send a link.
CREATE OR REPLACE FUNCTION public.confirm_auth_user_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = auth, public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NULL AND NEW.invited_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_auth_user_on_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_auth_user_on_insert() FROM anon, authenticated;

DROP TRIGGER IF EXISTS confirm_auth_user_on_insert ON auth.users;
CREATE TRIGGER confirm_auth_user_on_insert
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.confirm_auth_user_on_insert();

INSERT INTO public.profiles (id, email, full_name)
SELECT id, COALESCE(email, ''), raw_user_meta_data->>'full_name'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

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

CREATE TABLE IF NOT EXISTS public.active_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('tablet', 'phone')),
  device_label TEXT,
  session_token_hash TEXT NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_active_device_sessions_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_active_device_sessions_user_active
  ON public.active_device_sessions(user_id, device_type, is_revoked);

CREATE OR REPLACE FUNCTION public.enforce_two_device_slot_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_revoked = FALSE THEN
    UPDATE public.active_device_sessions
    SET is_revoked = TRUE,
        last_active_at = now()
    WHERE user_id = NEW.user_id
      AND device_type = NEW.device_type
      AND device_id <> NEW.device_id
      AND is_revoked = FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_two_device_slot_limit ON public.active_device_sessions;
CREATE TRIGGER trg_enforce_two_device_slot_limit
  BEFORE INSERT OR UPDATE ON public.active_device_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_two_device_slot_limit();

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

CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.activate_free_plan()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT access_status INTO current_status
  FROM public.profiles
  WHERE id = auth.uid();

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF current_status IN ('free', 'active_paid', 'class_sponsored', 'trial') THEN
    RETURN jsonb_build_object('access_status', current_status);
  END IF;

  PERFORM set_config('app.allow_access_update', 'on', true);
  UPDATE public.profiles
    SET access_status = 'free',
        access_granted_at = now()
    WHERE id = auth.uid();

  RETURN jsonb_build_object('access_status', 'free');
END;
$$;

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

REVOKE ALL ON FUNCTION public.activate_free_plan() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_direct_checkout(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_class_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_class_invite(TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_instructor_roster() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_student_class_access(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_student_by_email(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.activate_free_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_direct_checkout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_class_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_class_invite(TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_instructor_roster() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_class_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_student_by_email(TEXT) TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own organization" ON public.organizations;
CREATE POLICY "Users can read their own organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Users can select own profile" ON public.profiles;
CREATE POLICY "Users can select own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

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

DROP POLICY IF EXISTS "Users can select own device sessions" ON public.active_device_sessions;
CREATE POLICY "Users can select own device sessions"
  ON public.active_device_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own device sessions" ON public.active_device_sessions;
CREATE POLICY "Users can insert own device sessions"
  ON public.active_device_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own device sessions" ON public.active_device_sessions;
CREATE POLICY "Users can update own device sessions"
  ON public.active_device_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own device sessions" ON public.active_device_sessions;
CREATE POLICY "Users can delete own device sessions"
  ON public.active_device_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

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

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_device_sessions TO authenticated;
GRANT SELECT, INSERT ON public.checkout_sessions TO authenticated;

NOTIFY pgrst, 'reload schema';
