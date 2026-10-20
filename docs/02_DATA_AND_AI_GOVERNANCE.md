# 02 — Data Architecture & 5-Shield AI Profit Protection System

---

## Overview
To serve Indian medical, BAMS, and competitive exam students at accessible price points (e.g., ₹199/month or seasonal Exam Passes) while maintaining high gross margins, the platform enforces the **5-Shield AI Profit Protection System** across every API route and client workflow.

---

## Shield 1: Page-Level RAG (Strict Context Window Bounding)
- **Rule:** Never transmit full PDF textbooks or entire multi-hour transcripts to the LLM in a single request.
- **Mechanism:**
  - Queries are scoped strictly to the **active page context** plus the **top 3 semantically matching chunks** retrieved via vector/hybrid search.
  - Maximum input payload is bounded to **~2,000 tokens** per standard lens or query call.
  - Preserves low latency (<1.5s time-to-first-token) and prevents runaway token billing.

---

## Shield 2: Hybrid Model Routing (90/10 Split)
- **Rule:** Route AI tasks dynamically by cognitive complexity:
  - **90% of Tasks -> Gemini Flash / Flash-Lite:**
    - Paragraph-level Multi-Lens explanations (Ayurvedic View, Illustrative View, High-Yield Revision, Test Me MCQs).
    - Real-time Parallel Video Lecture timestamp notes.
    - 24h/72h Spaced Repetition Flashcard generation.
  - **10% of Tasks -> Gemini Pro:**
    - Multi-Source Synthesis Studio (merging 2+ notebooks and 2+ video transcripts into a Master Study Book).
    - Complex differential diagnosis or cross-Samhita synthesis queries.

---

## Shield 3: Shared Batch Caching (Zero-Marginal-Cost Cohort Reads)
- **Rule:** Never recompute identical explanations for standard textbooks or popular YouTube lectures.
- **Mechanism:**
  - Every AI lens output and video lecture note block is indexed in Supabase by a deterministic composite key:
    $$\text{CacheKey} = \text{SHA256}(\text{content\_hash} + \text{page\_or\_timestamp} + \text{lens\_type} + \text{prakriti\_primary\_dosha})$$
  - When 500 students in a batch highlight the same verse in *Charaka Samhita* or watch the same YouTube lecture, **Student #1 triggers generation** and **Students #2–#500 hit the shared cache at ₹0 AI cost** and <80ms latency.

---

## Shield 4: Internal Wallet Ceiling & Automatic Graceful Downgrade
- **Rule:** Every user account has a hard monthly internal API cost ledger tracked in Supabase (`user_ai_usage_ledger`).
- **Mechanism:**
  - On a ₹199/month student plan, the hard internal AI cost ceiling is capped (e.g., **₹70.00 / month**).
  - Each LLM call logs exact input/output tokens and INR micro-cost.
  - If a power user approaches 85% of their monthly ceiling, all Gemini Pro calls automatically fall back to **Gemini Flash-Lite** + cached responses so the student never hits a hard service blackout while unit economics remain guaranteed profitable.

---

## Shield 5: 2-Device Concurrent Session Lock
- **Rule:** Prevent account sharing across entire hostel wings or coaching batches.
- **Mechanism:**
  - Active device fingerprints/sessions are tracked in Supabase Auth + `active_device_sessions`.
  - Strictly limited to **1 Tablet/Laptop + 1 Mobile Phone** (maximum 2 registered concurrent devices per student).
  - Logging in on a 3rd device immediately revokes the oldest session token and triggers watermarked audit logging on B2B coaching documents.
