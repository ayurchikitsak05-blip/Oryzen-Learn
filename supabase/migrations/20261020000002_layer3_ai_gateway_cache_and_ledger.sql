-- =============================================================================
-- Layer 3 Migration: Controlled AI Gateway, pgvector Document Chunks,
-- Semantic & Selection Response Cache (`ai_response_cache`),
-- Internal Wallet Ledger (`ai_usage_logs`), and Deep-Linked `notebook_entries`
-- =============================================================================

-- Enable pgvector extension for Shield 1 Page-Level RAG top-3 chunk retrieval
CREATE EXTENSION IF NOT EXISTS "vector";

-- -----------------------------------------------------------------------------
-- 1. DOCUMENT_CHUNKS TABLE (Shield 1: Page-Level RAG + Top 3 pgvector Chunks)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_hash TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  section_heading TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  bounding_box JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "width": 0, "height": 0}'::jsonb,
  token_estimate INTEGER NOT NULL DEFAULT 1,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_page
  ON public.document_chunks(document_hash, page_number);

-- -----------------------------------------------------------------------------
-- 2. AI_RESPONSE_CACHE TABLE (Shield 3: 0-Token Semantic & Selection Caching)
-- Keyed by (document_hash + page_number + normalized_selection_hash + lens_type)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  document_hash TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  normalized_selection_hash TEXT NOT NULL,
  lens_type TEXT NOT NULL CHECK (
    lens_type IN (
      'ayurvedic',
      'illustrative',
      'high_yield_revision',
      'add_to_notebook',
      'test_me',
      'deep_integrative_synthesis'
    )
  ),
  prakriti_dosha TEXT NOT NULL DEFAULT 'Vata',
  model_used TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_response_cache_composite UNIQUE (
    document_hash,
    page_number,
    normalized_selection_hash,
    lens_type
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_lookup
  ON public.ai_response_cache(document_hash, page_number, normalized_selection_hash, lens_type);

-- -----------------------------------------------------------------------------
-- 3. AI_USAGE_LOGS TABLE (Shield 4: Internal Wallet Ledger & ₹70 Hard Cap)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL, -- Format: 'YYYY-MM'
  lens_type TEXT NOT NULL,
  model_used TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_inr NUMERIC(10, 4) NOT NULL DEFAULT 0.0000 CHECK (cost_inr >= 0),
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  downgraded_to_flash_lite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_month
  ON public.ai_usage_logs(user_id, billing_month);

-- -----------------------------------------------------------------------------
-- 4. NOTEBOOK_ENTRIES TABLE (Bi-Directional Deep Links to PDF Coordinates)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notebook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  document_title TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  section_heading TEXT NOT NULL,
  bounding_box JSONB NOT NULL,
  highlighted_text TEXT NOT NULL,
  ai_synthesis_markdown TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebook_entries_user_doc
  ON public.notebook_entries(user_id, document_id, page_number);

-- -----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES FOR LAYER 3 TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_entries ENABLE ROW LEVEL SECURITY;

-- document_chunks RLS
DROP POLICY IF EXISTS "Authenticated users can read accessible document chunks" ON public.document_chunks;
CREATE POLICY "Authenticated users can read accessible document chunks"
  ON public.document_chunks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND (
          d.user_id = auth.uid()
          OR (d.organization_id IS NOT NULL AND d.organization_id = public.current_user_organization_id())
        )
    )
  );

-- ai_response_cache RLS: Shared cohort read/write for authenticated students (Shield 3)
DROP POLICY IF EXISTS "Authenticated users can read shared AI response cache" ON public.ai_response_cache;
CREATE POLICY "Authenticated users can read shared AI response cache"
  ON public.ai_response_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert shared AI response cache" ON public.ai_response_cache;
CREATE POLICY "Authenticated users can insert shared AI response cache"
  ON public.ai_response_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ai_usage_logs RLS: Users can only read and insert their own wallet ledger entries
DROP POLICY IF EXISTS "Users can select own ai_usage_logs" ON public.ai_usage_logs;
CREATE POLICY "Users can select own ai_usage_logs"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai_usage_logs" ON public.ai_usage_logs;
CREATE POLICY "Users can insert own ai_usage_logs"
  ON public.ai_usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- notebook_entries RLS: Users can only read/write their own deep-linked notebook entries
DROP POLICY IF EXISTS "Users can select own notebook_entries" ON public.notebook_entries;
CREATE POLICY "Users can select own notebook_entries"
  ON public.notebook_entries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notebook_entries" ON public.notebook_entries;
CREATE POLICY "Users can insert own notebook_entries"
  ON public.notebook_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notebook_entries" ON public.notebook_entries;
CREATE POLICY "Users can delete own notebook_entries"
  ON public.notebook_entries
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
