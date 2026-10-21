CREATE TABLE IF NOT EXISTS public.subject_vaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vault_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.subject_vaults(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  storage_path text NOT NULL,
  page_count integer NOT NULL DEFAULT 0,
  excerpt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vault_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.subject_vaults(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vault_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.subject_vaults(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('study_notes', 'recall')),
  title text NOT NULL,
  body_markdown text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subject_vaults_user ON public.subject_vaults(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_sources_vault ON public.vault_sources(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_messages_vault ON public.vault_messages(vault_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vault_notes_vault ON public.vault_notes(vault_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_subject_vaults_updated_at ON public.subject_vaults;
CREATE TRIGGER trg_subject_vaults_updated_at
  BEFORE UPDATE ON public.subject_vaults
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.subject_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their subject vaults" ON public.subject_vaults;
CREATE POLICY "Users manage their subject vaults"
  ON public.subject_vaults
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their vault sources" ON public.vault_sources;
CREATE POLICY "Users manage their vault sources"
  ON public.vault_sources
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subject_vaults vault
      WHERE vault.id = vault_id AND vault.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users manage their vault messages" ON public.vault_messages;
CREATE POLICY "Users manage their vault messages"
  ON public.vault_messages
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subject_vaults vault
      WHERE vault.id = vault_id AND vault.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users manage their vault notes" ON public.vault_notes;
CREATE POLICY "Users manage their vault notes"
  ON public.vault_notes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subject_vaults vault
      WHERE vault.id = vault_id AND vault.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_vaults TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_notes TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'authorized-documents',
  'authorized-documents',
  FALSE,
  209715200,
  ARRAY['application/pdf', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = 209715200,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
