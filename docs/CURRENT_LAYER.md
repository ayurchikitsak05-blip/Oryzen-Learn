# Current Layer Execution Tracker

> **Discipline Reminder:** Read `.cursor/rules/00-core-discipline.mdc` before writing code. Only implement tasks in the currently active layer. No item may be marked `[x]` until `npm run test` and `npm run build` pass with zero errors.

---

## 6-Layer Master Roadmap Overview

- **Layer 0 (COMPLETED):** Repository Skeleton, Prakriti Design Tokens, 70/30 & 50/50 Scoring Engine, Testing Harness, and Health Verification Shell.
- **Layer 1 (COMPLETED):** Auth, Multi-Tenant Database Schema, Secure Storage, 2-Device Session Lock, and Prakriti Onboarding Database Sync.
- **Layer 2 (COMPLETED):** The Tablet-First PDF Engine & Local-First Storage Pipeline (`IndexedDB`/`OPFS`, SHA-256 Deduplication, 3-Page Virtualized RAM Window `Page N-1, N, N+1`, Split-Screen Touch Reader, and Citation-Ready Text Extraction).
- **Layer 3 (COMPLETED):** Controlled AI Gateway, 5-Shield Profit Protection Ledger (`ai_response_cache`, `ai_usage_logs`, `document_chunks`, `notebook_entries`), and Multi-Lens Highlighting (`HighlightToolbar.tsx`).
- **Layer 4 (COMPLETED):** Parallel Video Lecture Studio (`VideoPlayer.tsx`, `ParallelNotes.tsx`), Multi-Source Synthesis Studio (`SynthesisStudio.tsx`), and Adaptive AI Memory Engine (`NoteModToolbar.tsx`, `adaptive-memory.ts`).
- **Layer 5 (ACTIVE — COMPLETED):** Freemium Quotas & Exam Booster Packs (`src/lib/billing/`), Coaching Institute B2B Portal (`src/app/institute/dashboard/page.tsx`), Dynamic Student Watermarking & DRM Protection, and Final Production Verification.

---

## Completed Layers

### Layer 0 — Repository Skeleton, Prakriti Design Tokens & Verification Harness
- [x] Initialize Next.js App Router with strict TypeScript and Tailwind CSS
- [x] Configure Prakriti Theme CSS variables (`--theme-vata`, `--theme-pitta`, `--theme-kapha`) and a typed Prakriti configuration constant module (`src/lib/prakriti/config.ts`)
- [x] Build `/api/health` endpoint returning system status, active layer (`Layer 0`), and available Prakriti profiles
- [x] Build a clean Tablet-First Foundation Shell on `/` displaying the Layer 0 System Verification Dashboard and interactive Prakriti Theme Switcher preview (Vata / Pitta / Kapha / Dwandwaja)
- [x] Configure Vitest unit tests (`src/lib/prakriti/__tests__/config.test.ts`) verifying the 70/30 & 50/50 Prakriti scoring and Dwandwaja classification math
- [x] Pass `npm run test` and `npm run build` with zero errors

### Layer 1 — Auth, Multi-Tenant Database Schema, Secure Storage & Prakriti Onboarding Database Sync
- [x] Install `@supabase/supabase-js` and `@supabase/ssr` and create client utilities (`src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`)
- [x] Implement Supabase Auth UI & API routes supporting Email/OTP and Google OAuth, enforcing the Strict 2-Device Lock rule (max 1 active Tablet + 1 active Phone session per user ID)
- [x] Create Supabase SQL migration files (`supabase/migrations/20261020000001_layer1_schema_rls_and_storage.sql`) for `organizations`, `profiles`, `documents`, `student_cognitive_memory`, `active_device_sessions`, strict RLS policies, and the private `authorized-documents` Storage bucket
- [x] Build the responsive tablet-first 4-step Prakriti Onboarding Questionnaire UI (`src/app/onboarding/page.tsx`) with 25 Basic Physical Prakriti questions, 20 Reading & Cognitive Ability questions, instant weighted calculation, and Supabase `profiles.prakriti_profile` persistence
- [x] Write automated Vitest unit/integration tests (`src/lib/supabase/__tests__/auth-device-lock.test.ts` and `src/lib/prakriti/__tests__/onboarding-flow.test.ts`)
- [x] Pass `npm run test` and `npm run build` with zero errors

### Layer 2 — The Tablet-First PDF Engine & Local-First Storage Pipeline
- [x] Install `pdfjs-dist` and configure the PDF worker in Next.js (`src/lib/reader/pdf-worker.ts`)
- [x] Build the SHA-256 file hashing utility (`src/lib/reader/hashing.ts`) for instant duplicate upload detection
- [x] Build the browser-local PDF storage manager (`src/lib/reader/storage.ts`) using `IndexedDB` and Origin Private File System (`OPFS`)
- [x] Build the citation-ready PDF text & bounding-box extraction engine (`src/lib/reader/extractor.ts`) capturing `document_id`, `page_number`, `section_heading`, and coordinates
- [x] Build the virtualized tablet PDF canvas reader (`src/components/reader/PdfViewer.tsx`) enforcing the strict 3-Page RAM Window (`Page N-1`, `Page N`, `Page N+1`), split-screen layout, pinch-to-zoom, touch selection handles, and smooth chapter navigation, plus `/reader` studio route (`src/app/reader/page.tsx`)
- [x] Write unit and integration tests (`src/lib/reader/__tests__/reader.test.ts`) verifying PDF worker configuration, storage caching/deduplication, 3-page window calculation, and text extraction chunking
- [x] Pass `npm run test`, `npm run build`, and `npm run lint` with zero errors

### Layer 3 — Controlled AI Gateway, Profit Protection Shields & Multi-Lens Highlighting
- [x] Create Supabase migration (`supabase/migrations/20261020000002_layer3_ai_gateway_cache_and_ledger.sql`) for `document_chunks` (`pgvector`), `ai_response_cache`, `ai_usage_logs`, and `notebook_entries`
- [x] Build the Controlled AI Gateway & 5-Shield Profit Protection Engine (`src/lib/ai/gateway.ts`) and `/api/ai/lens` endpoint enforcing Shield 1 (~2,000 token Page-Level RAG), Shield 2 (90% Flash / 10% Pro routing), Shield 3 (`ai_response_cache`), and Shield 4 (`ai_usage_logs` ₹70 hard cap with Flash-Lite fallback)
- [x] Build the Multi-Lens Highlight Action Bar (`src/components/reader/HighlightToolbar.tsx`) with 5 1-tap lenses (Ayurvedic View, Illustrative View, Revision View, Add to Notebook, Test Me) and clickable inline citations (`[Page X, Section Y]`) integrated into `PdfViewer.tsx`
- [x] Write integration tests (`src/lib/ai/__tests__/gateway.test.ts`) verifying AI gateway responses, semantic & selection caching hits, Page-Level RAG bounding, and wallet ledger ceiling fallback
- [x] Pass `npm run test`, `npm run build`, and `npm run lint` with zero errors

### Layer 4 — Parallel Video Lecture Studio, Multi-Source Synthesis Studio & Adaptive AI Memory Engine
- [x] Build the YouTube IFrame & Local `.mp4` Video Player (`src/components/video/VideoPlayer.tsx`) and Parallel Live-Sync Note Streamer (`src/components/video/ParallelNotes.tsx` & `src/lib/video/sync-engine.ts`) with clickable `[04:18]` timestamp badges and bi-directional scrolling, plus `/video` route (`src/app/video/page.tsx`)
- [x] Build the Multi-Source Synthesis Studio (`src/components/synthesis/SynthesisStudio.tsx` & `src/lib/synthesis/master-book.ts`) merging 2+ personal notebooks and 2+ video lecture transcripts into a unified Prakriti-formatted Master Study Book with inline citations, plus `/synthesis` route (`src/app/synthesis/page.tsx`)
- [x] Build the Student Note Modification Bar (`src/components/notes/NoteModToolbar.tsx`) and Adaptive Cognitive Memory Engine (`src/lib/ai/adaptive-memory.ts` & `src/app/api/ai/memory/route.ts`) updating the rolling 200-word Student Cognitive DNA Card in `student_cognitive_memory`
- [x] Write automated tests (`src/lib/ai/__tests__/adaptive-memory.test.ts` and `src/lib/video/__tests__/video-sync.test.ts`) verifying parallel note sync, multi-source synthesis, and adaptive DNA updates
- [x] Pass `npm run test`, `npm run build`, and `npm run lint` with zero errors

---

## Active Layer: Layer 5 — Freemium Metering, Exam Booster Packs & Coaching Institute B2B Portal (ALL LAYERS 0–5 COMPLETE)

- [x] Create Supabase migration (`supabase/migrations/20261020000003_layer5_billing_quotas_and_institute_drm.sql`) for `user_subscriptions_and_quotas`, `institute_batch_assets`, and database quota enforcement triggers
- [x] Build the Freemium Quotas & Exam Booster Packs engine (`src/lib/billing/quotas.ts` & `src/app/api/billing/quotas/route.ts`) enforcing Free Tier (3 PDFs, 10 AI explanations/day, 1 quiz/day), Pro / Exam Pass Tier (₹199/mo or ₹799/6mo: 25+ PDFs, 150 AI explanations/day, unlimited quizzes & spaced repetition), and Exam Booster Top-Up (₹49/mo: +100 AI explanations + 20 quizzes)
- [x] Build the Coaching Institute B2B Portal & Admin Dashboard (`src/app/institute/dashboard/page.tsx` & `src/lib/institute/drm-portal.ts`) with master authorized PDF & batch lecture distribution, DRM protection (blocking local download/print), dynamic student-ID & phone watermark overlay, batch analytics, and syllabus-locked AI distribution
- [x] Write unit and integration tests (`src/lib/billing/__tests__/quotas.test.ts`) verifying quota limits, Exam Booster top-ups, and institute DRM watermarking access control
- [x] Pass `npm run test`, `npm run build`, and `npm run lint` with zero errors and mark all layers complete
