-- =============================================================================
-- Layer 1 Migration: Multi-Tenant Schema, Prakriti Profiles, 2-Device Lock,
-- Row-Level Security (RLS), and Private Authorized Documents Storage Bucket
-- =============================================================================

-- Enable UUID generation extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ORGANIZATIONS TABLE (B2B Coaching Institute Multi-Tenant Distribution)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- -----------------------------------------------------------------------------
-- 2. PROFILES TABLE (Linked to auth.users, B2C/B2B & Prakriti Profile JSONB)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  prakriti_profile JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);

-- Automatic updated_at trigger helper
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

-- Automatically provision profile row when a new auth.users entry is created
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

-- -----------------------------------------------------------------------------
-- 3. DOCUMENTS TABLE (Student Local-Backed & Institute Authorized Textbooks)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  storage_path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 1 CHECK (page_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON public.documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON public.documents(file_hash);

-- -----------------------------------------------------------------------------
-- 4. STUDENT_COGNITIVE_MEMORY TABLE (Rolling 200-Word Cognitive DNA Card)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_cognitive_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cognitive_dna_summary JSONB NOT NULL DEFAULT '{"summary_text": "", "word_count": 0, "signals": {}}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_cognitive_memory_user_id ON public.student_cognitive_memory(user_id);

DROP TRIGGER IF EXISTS trg_student_cognitive_memory_updated_at ON public.student_cognitive_memory;
CREATE TRIGGER trg_student_cognitive_memory_updated_at
  BEFORE UPDATE ON public.student_cognitive_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

-- -----------------------------------------------------------------------------
-- 5. ACTIVE_DEVICE_SESSIONS TABLE (Shield 5: Strict 2-Device Lock: 1 Tablet + 1 Phone)
-- -----------------------------------------------------------------------------
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

-- Trigger to enforce at most 1 active 'tablet' and 1 active 'phone' session per user_id
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

-- -----------------------------------------------------------------------------
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_cognitive_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_device_sessions ENABLE ROW LEVEL SECURITY;

-- Helper function to retrieve current authenticated user's organization_id without RLS recursion
CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 6.1 organizations RLS: Students can view their own coaching institute organization
DROP POLICY IF EXISTS "Users can read their own organization" ON public.organizations;
CREATE POLICY "Users can read their own organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = public.current_user_organization_id());

-- 6.2 profiles RLS: Users can only read/write their own profile
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

-- 6.3 documents RLS: Users can read/write own documents, and coaching institute students can read institute documents
DROP POLICY IF EXISTS "Users can select own or authorized organization documents" ON public.documents;
CREATE POLICY "Users can select own or authorized organization documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      organization_id IS NOT NULL
      AND organization_id = public.current_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
CREATE POLICY "Users can insert own documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6.4 student_cognitive_memory RLS: Users can only read/write their own cognitive DNA memory
DROP POLICY IF EXISTS "Users can select own cognitive memory" ON public.student_cognitive_memory;
CREATE POLICY "Users can select own cognitive memory"
  ON public.student_cognitive_memory
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own cognitive memory" ON public.student_cognitive_memory;
CREATE POLICY "Users can insert own cognitive memory"
  ON public.student_cognitive_memory
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own cognitive memory" ON public.student_cognitive_memory;
CREATE POLICY "Users can update own cognitive memory"
  ON public.student_cognitive_memory
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6.5 active_device_sessions RLS: Users can only read/write their own active device sessions
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

-- -----------------------------------------------------------------------------
-- 7. PRIVATE STORAGE BUCKET (`authorized-documents`) & STORAGE RLS POLICIES
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'authorized-documents',
  'authorized-documents',
  FALSE,
  104857600, -- 100 MB limit per file
  ARRAY['application/pdf', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage objects RLS: Authenticated users can read their own uploaded files
-- (`users/<user_id>/...`) or coaching institute files (`orgs/<organization_id>/...`)
-- strictly via short-lived signed URLs.
DROP POLICY IF EXISTS "Authorized users can read own or org documents in storage" ON storage.objects;
CREATE POLICY "Authorized users can read own or org documents in storage"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'authorized-documents'
    AND (
      (
        (storage.foldername(name))[1] = 'users'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR (
        (storage.foldername(name))[1] = 'orgs'
        AND (storage.foldername(name))[2] = public.current_user_organization_id()::text
      )
    )
  );

DROP POLICY IF EXISTS "Authorized users can upload own documents to storage" ON storage.objects;
CREATE POLICY "Authorized users can upload own documents to storage"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'authorized-documents'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authorized users can delete own documents in storage" ON storage.objects;
CREATE POLICY "Authorized users can delete own documents in storage"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'authorized-documents'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
