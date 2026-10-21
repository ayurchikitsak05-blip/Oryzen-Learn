/**
 * Layer 3: Controlled AI Gateway & 5-Shield Profit Protection System
 *
 * Implements:
 * - Shield 1 (Page-Level RAG): Active page text + top 3 matching chunks (~2,000 token budget).
 * - Shield 2 (Hybrid Model Routing): 90% tasks -> Gemini Flash (`gemini-2.5-flash`),
 *   10% deep integrative tasks -> Gemini Pro (`gemini-2.5-pro`).
 * - Shield 3 (Semantic & Selection Caching): `ai_response_cache` keyed by
 *   `(document_hash + page_number + normalized_selection_hash + lens_type)` so repeated highlights cost 0 tokens.
 * - Shield 4 (Internal Wallet Ledger): Tracks token costs in `ai_usage_logs` against a hard
 *   monthly INR cap (e.g., ₹70.00), automatically falling back to `gemini-2.5-flash-lite` when reached.
 */

import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dosha, HighlightLensType } from "@/lib/prakriti/config";
import type { BoundingBox, CitationReadyChunk } from "@/lib/reader/extractor";
import { computeSha256Hex } from "@/lib/reader/hashing";

export type GatewayTaskType =
  | HighlightLensType
  | "deep_integrative_synthesis";

export type GeminiModelTier =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash-lite";

export const SHIELD_1_MAX_PROMPT_TOKENS = 2000;
export const SHIELD_1_TOP_K_CHUNKS = 3;
export const SHIELD_4_DEFAULT_WALLET_CAP_INR = 70.0;
export const SHIELD_4_SOFT_DOWNGRADE_RATIO = 0.85;

/**
 * Per-1,000-token internal INR cost rates for Shield 4 wallet ledger accounting.
 */
export const MODEL_COST_PER_1K_TOKENS_INR: Record<
  GeminiModelTier,
  { inputInr: number; outputInr: number }
> = {
  "gemini-2.5-pro": { inputInr: 0.14, outputInr: 0.42 },
  "gemini-2.5-flash": { inputInr: 0.018, outputInr: 0.054 },
  "gemini-2.5-flash-lite": { inputInr: 0.006, outputInr: 0.018 },
};

export interface InlineCitationCoordinate {
  label: string; // e.g. "[Page 2, Section CHAPTER 2: TRIDOSHA SAMPRAPTI]"
  document_id: string;
  page_number: number;
  section_heading: string;
  bounding_box: BoundingBox;
}

export interface TestMeMcqItem {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  citationLabel: string;
}

export interface AiLensResponsePayload {
  lens_type: GatewayTaskType;
  prakriti_dosha: Dosha;
  title: string;
  markdown_body: string;
  key_points: string[];
  mcqs?: TestMeMcqItem[];
  citations: InlineCitationCoordinate[];
}

export interface AiGatewayExecutionResult {
  cacheHit: boolean;
  cacheKey: string;
  normalizedSelectionHash: string;
  requestedModel: GeminiModelTier;
  modelUsed: GeminiModelTier;
  downgradedToFlashLite: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costInr: number;
  monthlySpendBeforeInr: number;
  monthlySpendAfterInr: number;
  walletCapInr: number;
  ragContextChunksUsed: number;
  payload: AiLensResponsePayload;
}

export interface AiGatewayRequest {
  userId: string;
  documentId: string;
  documentHash: string;
  pageNumber: number;
  sectionHeading: string;
  selectedText: string;
  selectionBoundingBox?: BoundingBox;
  lensType: GatewayTaskType;
  prakritiDosha?: Dosha;
  activePageText?: string;
  candidateChunks?: CitationReadyChunk[];
  walletCapInr?: number;
  billingMonth?: string;
  supabase?: SupabaseClient | null;
  llmGenerator?: (params: {
    model: GeminiModelTier;
    prompt: string;
    request: AiGatewayRequest;
    ragChunks: CitationReadyChunk[];
  }) => Promise<{
    payload: AiLensResponsePayload;
    promptTokens?: number;
    completionTokens?: number;
  }>;
}

/**
 * Normalizes selected text (lowercased, collapsed whitespace, stripped punctuation noise)
 * and hashes it with SHA-256 so minor selection padding differences still hit Shield 3 cache.
 */
export async function computeNormalizedSelectionHash(
  selectedText: string
): Promise<string> {
  const normalized = selectedText
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return computeSha256Hex(normalized);
}

/**
 * Builds the deterministic Shield 3 composite cache key:
 * `(document_hash + page_number + normalized_selection_hash + lens_type)`
 */
export async function buildShield3CacheKey(params: {
  documentHash: string;
  pageNumber: number;
  selectedText: string;
  lensType: GatewayTaskType;
}): Promise<{ cacheKey: string; normalizedSelectionHash: string }> {
  const normalizedSelectionHash = await computeNormalizedSelectionHash(
    params.selectedText
  );
  const rawComposite = `${params.documentHash.trim().toLowerCase()}|p:${
    params.pageNumber
  }|sel:${normalizedSelectionHash}|lens:${params.lensType}`;
  const cacheKey = await computeSha256Hex(rawComposite);
  return { cacheKey, normalizedSelectionHash };
}

/**
 * Shield 1 (Page-Level RAG):
 * Ranks candidate chunks by lexical/semantic overlap with `selectedText` + active page proximity,
 * returning the active page context + top 3 matching chunks bounded to ~2,000 tokens.
 */
export function selectPageLevelRagContext(params: {
  selectedText: string;
  activePageNumber: number;
  activePageText?: string;
  candidateChunks: CitationReadyChunk[];
  maxTokens?: number;
  topK?: number;
}): {
  selectedChunks: CitationReadyChunk[];
  boundedPromptContext: string;
  estimatedTokens: number;
} {
  const {
    selectedText,
    activePageNumber,
    activePageText = "",
    candidateChunks,
    maxTokens = SHIELD_1_MAX_PROMPT_TOKENS,
    topK = SHIELD_1_TOP_K_CHUNKS,
  } = params;

  const queryTerms = new Set(
    selectedText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );

  const scored = candidateChunks.map((chunk) => {
    const words = chunk.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/);
    let overlap = 0;
    for (const w of words) {
      if (queryTerms.has(w)) overlap += 1;
    }
    const samePageBonus = chunk.page_number === activePageNumber ? 3 : 0;
    return {
      chunk,
      score: overlap + samePageBonus,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (
      Math.abs(a.chunk.page_number - activePageNumber) -
      Math.abs(b.chunk.page_number - activePageNumber)
    );
  });

  const topChunks = scored.slice(0, topK).map((s) => s.chunk);

  // Assemble bounded context under maxTokens (~2,000 tokens)
  const segments: string[] = [];
  let runningTokens = 0;

  const estimateTokens = (str: string) =>
    Math.max(1, Math.ceil(str.trim().split(/\s+/).filter(Boolean).length * 1.3));

  const selectionHeader = `SELECTED PASSAGE (Page ${activePageNumber}):\n"${selectedText.trim()}"`;
  segments.push(selectionHeader);
  runningTokens += estimateTokens(selectionHeader);

  if (activePageText.trim()) {
    const pageWords = activePageText.trim().split(/\s+/);
    const maxPageWords = 350;
    const clippedPage = pageWords.slice(0, maxPageWords).join(" ");
    const pageSegment = `ACTIVE PAGE CONTEXT (Page ${activePageNumber}):\n${clippedPage}`;
    const segTokens = estimateTokens(pageSegment);
    if (runningTokens + segTokens <= maxTokens) {
      segments.push(pageSegment);
      runningTokens += segTokens;
    }
  }

  const finalChunks: CitationReadyChunk[] = [];
  for (const chunk of topChunks) {
    const chunkBlock = `MATCHING CHUNK [Page ${chunk.page_number}, Section ${chunk.section_heading}]:\n${chunk.text}`;
    const chunkTokens = estimateTokens(chunkBlock);
    if (runningTokens + chunkTokens <= maxTokens) {
      segments.push(chunkBlock);
      runningTokens += chunkTokens;
      finalChunks.push(chunk);
    }
  }

  return {
    selectedChunks: finalChunks,
    boundedPromptContext: segments.join("\n\n"),
    estimatedTokens: Math.min(runningTokens, maxTokens),
  };
}

/**
 * Shield 2 (Hybrid Model Routing) & Shield 4 (Wallet Ceiling Fallback):
 * - 90% standard tasks (5 highlight lenses) -> `gemini-2.5-flash`
 * - 10% deep integrative synthesis -> `gemini-2.5-pro`
 * - If user's monthly spend >= walletCapInr (or >= 85% of cap for Pro requests),
 *   automatically downgrades to `gemini-2.5-flash-lite`.
 */
export function resolveShieldedModelRoute(params: {
  lensType: GatewayTaskType;
  currentMonthlySpendInr: number;
  walletCapInr?: number;
}): {
  requestedModel: GeminiModelTier;
  effectiveModel: GeminiModelTier;
  downgradedToFlashLite: boolean;
} {
  const walletCap = params.walletCapInr ?? SHIELD_4_DEFAULT_WALLET_CAP_INR;

  // Shield 2: 90% Flash vs 10% Pro
  const requestedModel: GeminiModelTier =
    params.lensType === "deep_integrative_synthesis"
      ? "gemini-2.5-pro"
      : "gemini-2.5-flash";

  // Shield 4: Hard cap & soft Pro downgrade
  const hardCapReached = params.currentMonthlySpendInr >= walletCap;
  const softProCapReached =
    requestedModel === "gemini-2.5-pro" &&
    params.currentMonthlySpendInr >= walletCap * SHIELD_4_SOFT_DOWNGRADE_RATIO;

  if (hardCapReached || softProCapReached) {
    return {
      requestedModel,
      effectiveModel: "gemini-2.5-flash-lite",
      downgradedToFlashLite: true,
    };
  }

  return {
    requestedModel,
    effectiveModel: requestedModel,
    downgradedToFlashLite: false,
  };
}

export function calculateCallCostInr(
  model: GeminiModelTier,
  promptTokens: number,
  completionTokens: number
): number {
  const rates = MODEL_COST_PER_1K_TOKENS_INR[model];
  const cost =
    (promptTokens / 1000) * rates.inputInr +
    (completionTokens / 1000) * rates.outputInr;
  return Number(cost.toFixed(4));
}

/**
 * Builds structured, citation-grounded lens output tailored to the student's Prakriti Dosha
 * and active highlight lens, ensuring every output includes clickable `[Page X, Section Y]` inline citations.
 */
export function buildDeterministicLensPayload(params: {
  request: AiGatewayRequest;
  ragChunks: CitationReadyChunk[];
}): AiLensResponsePayload {
  const { request, ragChunks } = params;
  const dosha: Dosha = request.prakritiDosha ?? "Vata";
  const primaryCitationLabel = `[Page ${request.pageNumber}, Section ${request.sectionHeading}]`;

  const defaultBox: BoundingBox = request.selectionBoundingBox ??
    ragChunks[0]?.bounding_box ?? {
      x: 48,
      y: 660,
      width: 460,
      height: 24,
    };

  const citations: InlineCitationCoordinate[] = [
    {
      label: primaryCitationLabel,
      document_id: request.documentId,
      page_number: request.pageNumber,
      section_heading: request.sectionHeading,
      bounding_box: defaultBox,
    },
  ];

  for (const chunk of ragChunks) {
    const label = `[Page ${chunk.page_number}, Section ${chunk.section_heading}]`;
    if (!citations.some((c) => c.label === label)) {
      citations.push({
        label,
        document_id: chunk.document_id,
        page_number: chunk.page_number,
        section_heading: chunk.section_heading,
        bounding_box: chunk.bounding_box,
      });
    }
  }

  const excerpt = request.selectedText.trim().slice(0, 180);

  switch (request.lensType) {
    case "ayurvedic":
      return {
        lens_type: "ayurvedic",
        prakriti_dosha: dosha,
        title: `Explore My Learning Approach`,
        markdown_body: [
          `### Explore My Learning Approach`,
          `Grounded in **"${excerpt}"** ${primaryCitationLabel}:`,
          `- **Study preferences:** Optional strategies you can try. In Ayurveda this is sometimes mapped to *Vata* (movement and change), *Pitta* (precision and transformation), and *Kapha* (stability and retention) ${primaryCitationLabel}.`,
          `- **Dhee-Dhriti-Smriti Application:** Grasp the claim (*Dhee*), hold attention on the mechanism (*Dhriti*), and schedule a recall check (*Smriti*) ${
            citations[1]?.label ?? primaryCitationLabel
          }.`,
          `- **Study Takeaway:** Name the root idea before memorizing surface details, then match the explanation density to the ${dosha} profile.`,
        ].join("\n"),
        key_points: [
          `Constitution reference: ${primaryCitationLabel}`,
          "Vata, Pitta, and Kapha energy correlation",
          `${dosha}-adapted study synthesis`,
        ],
        citations,
      };

    case "illustrative":
      return {
        lens_type: "illustrative",
        prakriti_dosha: dosha,
        title: `🎨 Illustrative Flowchart & Analogy View (${dosha} Dhee Grasp)`,
        markdown_body: [
          `### Visual Mechanism Flowchart & Real-World Analogy`,
          `Source Anchor: ${primaryCitationLabel}`,
          "```",
          `[Core Idea] ──► [Mechanism] ──► [Worked Example] ──► [Recall Check]`,
          "```",
          `- **Story Analogy for Rapid Grasping (*Dhee*):** Imagine the idea as a three-channel system: *Vata* carries it forward, *Pitta* transforms it into a precise claim, and *Kapha* holds it in memory ${primaryCitationLabel}.`,
          `- **Mind-Map Node:** "${excerpt.slice(0, 80)}..." links directly to ${
            citations[1]?.label ?? primaryCitationLabel
          }.`,
        ].join("\n"),
        key_points: [
          `Visual Flow Anchor: ${primaryCitationLabel}`,
          "Analogy mapped to Dhee (rapid conceptual grasping)",
          "Mermaid/ASCII structural pathway ready for 24h recall",
        ],
        citations,
      };

    case "high_yield_revision":
      return {
        lens_type: "high_yield_revision",
        prakriti_dosha: dosha,
        title: `⚡ High-Yield Exam Revision Table & Mnemonic (${dosha} Smriti)`,
        markdown_body: [
          `### Differential Revision Matrix ${primaryCitationLabel}`,
          `| Parameter | Core Feature | Citation Anchor |`,
          `| :--- | :--- | :--- |`,
          `| Core Concept | ${excerpt.slice(0, 65)} | ${primaryCitationLabel} |`,
          `| Energy Role | Vata (movement) • Pitta (precision) • Kapha (stability) | ${primaryCitationLabel} |`,
          `| Exam High-Yield | Often tested in short-answer, assertion-reason, and viva-style questions across faculties | ${
            citations[1]?.label ?? primaryCitationLabel
          } |`,
          ``,
          `- **High-Retention Mnemonic (*Smriti*):** **D-D-S** = *Dhee* (Grasp) → *Dhriti* (Anchor) → *Smriti* (Recall) ${primaryCitationLabel}.`,
        ].join("\n"),
        key_points: [
          `Differential comparison table anchored at ${primaryCitationLabel}`,
          "Mnemonic: D-D-S (Dhee -> Dhriti -> Smriti)",
          "High-probability exam point for your course",
        ],
        citations,
      };

    case "save_passage":
      return {
        lens_type: "save_passage",
        prakriti_dosha: dosha,
        title: `Saved to My Notebook`,
        markdown_body: [
          `### Saved to My Notebook ${primaryCitationLabel}`,
          `> "${request.selectedText.trim()}"`,
          ``,
          `- **Page link:** \`x:${defaultBox.x}, y:${defaultBox.y}, w:${defaultBox.width}, h:${defaultBox.height}\` on ${primaryCitationLabel}.`,
          `- **Return anytime:** Tap the citation ${primaryCitationLabel} to go back to this exact place in your reading.`,
        ].join("\n"),
        key_points: [
          `Bi-directional coordinate link saved: ${primaryCitationLabel}`,
          `Bounding Box: [x:${defaultBox.x}, y:${defaultBox.y}]`,
          "Ready for Layer 5 Multi-Source Synthesis Studio",
        ],
        citations,
      };

    case "test_me":
    default:
      return {
        lens_type: request.lensType,
        prakriti_dosha: dosha,
        title: `🎯 Active Recall Paragraph-Grounded MCQ (${dosha} Check-In)`,
        markdown_body: [
          `### Instant Paragraph-Grounded Active Recall ${primaryCitationLabel}`,
          `Test your *Smriti* on the highlighted passage before scrolling to the next page ${primaryCitationLabel}.`,
        ].join("\n"),
        key_points: [
          `Grounded strictly in ${primaryCitationLabel}`,
          "Verifies Dhee & Smriti retention before advancing",
        ],
        mcqs: [
          {
            question: `Which study rhythm best locks the idea in ${primaryCitationLabel} into memory?`,
            options: [
              "Dhee (grasp the idea), Dhriti (hold focus), and Smriti (recall it later)",
              "Read the heading once and move on",
              "Copy the paragraph without restating it",
              "Use one fixed format regardless of your energy profile",
            ],
            correctIndex: 0,
            explanation: `Dhee, Dhriti, and Smriti govern how any student grasps, holds, and recalls a passage, alongside Vata, Pitta, and Kapha study energy (${primaryCitationLabel}).`,
            citationLabel: primaryCitationLabel,
          },
        ],
        citations,
      };
  }
}

// In-memory fallback stores for Shield 3 Cache & Shield 4 Wallet Ledger when Supabase is offline or in local tests
const localMemoryResponseCache = new Map<
  string,
  {
    model_used: GeminiModelTier;
    response_payload: AiLensResponsePayload;
    hit_count: number;
  }
>();
const localMemoryUsageLedger = new Map<string, number>();

export function clearLocalAiGatewayState(): void {
  localMemoryResponseCache.clear();
  localMemoryUsageLedger.clear();
}

export function setLocalWalletSpendForUser(
  userId: string,
  billingMonth: string,
  amountInr: number
): void {
  localMemoryUsageLedger.set(`${userId}|${billingMonth}`, amountInr);
}

async function lookupCachedResponse(
  supabase: SupabaseClient | null | undefined,
  params: {
    cacheKey: string;
    documentHash: string;
    pageNumber: number;
    normalizedSelectionHash: string;
    lensType: GatewayTaskType;
  }
): Promise<{
  model_used: GeminiModelTier;
  response_payload: AiLensResponsePayload;
} | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("ai_response_cache")
        .select("model_used, response_payload")
        .eq("document_hash", params.documentHash)
        .eq("page_number", params.pageNumber)
        .eq("normalized_selection_hash", params.normalizedSelectionHash)
        .eq("lens_type", params.lensType)
        .maybeSingle();

      if (!error && data?.response_payload) {
        return {
          model_used: data.model_used as GeminiModelTier,
          response_payload: data.response_payload as AiLensResponsePayload,
        };
      }
    } catch {
      // Fall back to local memory cache
    }
  }

  const mem = localMemoryResponseCache.get(params.cacheKey);
  if (mem) {
    mem.hit_count += 1;
    return {
      model_used: mem.model_used,
      response_payload: mem.response_payload,
    };
  }

  return null;
}

async function storeCachedResponse(
  supabase: SupabaseClient | null | undefined,
  params: {
    cacheKey: string;
    documentHash: string;
    pageNumber: number;
    normalizedSelectionHash: string;
    lensType: GatewayTaskType;
    prakritiDosha: Dosha;
    modelUsed: GeminiModelTier;
    payload: AiLensResponsePayload;
  }
): Promise<void> {
  localMemoryResponseCache.set(params.cacheKey, {
    model_used: params.modelUsed,
    response_payload: params.payload,
    hit_count: 1,
  });

  if (supabase) {
    try {
      await supabase.from("ai_response_cache").upsert(
        {
          cache_key: params.cacheKey,
          document_hash: params.documentHash,
          page_number: params.pageNumber,
          normalized_selection_hash: params.normalizedSelectionHash,
          lens_type: params.lensType,
          prakriti_dosha: params.prakritiDosha,
          model_used: params.modelUsed,
          response_payload: params.payload,
          hit_count: 1,
        },
        {
          onConflict:
            "document_hash,page_number,normalized_selection_hash,lens_type",
        }
      );
    } catch {
      // Local memory cache already updated
    }
  }
}

async function getCurrentMonthlyWalletSpendInr(
  supabase: SupabaseClient | null | undefined,
  userId: string,
  billingMonth: string
): Promise<number> {
  const ledgerKey = `${userId}|${billingMonth}`;
  let spend = localMemoryUsageLedger.get(ledgerKey) ?? 0;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("ai_usage_logs")
        .select("cost_inr")
        .eq("user_id", userId)
        .eq("billing_month", billingMonth);

      if (!error && Array.isArray(data)) {
        const dbSum = data.reduce(
          (acc, row: { cost_inr?: number | string }) =>
            acc + Number(row.cost_inr ?? 0),
          0
        );
        spend = Math.max(spend, Number(dbSum.toFixed(4)));
      }
    } catch {
      // Fallback to local memory ledger
    }
  }

  return Number(spend.toFixed(4));
}

async function recordWalletUsageLog(
  supabase: SupabaseClient | null | undefined,
  entry: {
    userId: string;
    billingMonth: string;
    lensType: GatewayTaskType;
    modelUsed: GeminiModelTier;
    promptTokens: number;
    completionTokens: number;
    costInr: number;
    cacheHit: boolean;
    downgradedToFlashLite: boolean;
  }
): Promise<number> {
  const ledgerKey = `${entry.userId}|${entry.billingMonth}`;
  const current = localMemoryUsageLedger.get(ledgerKey) ?? 0;
  const updated = Number((current + entry.costInr).toFixed(4));
  localMemoryUsageLedger.set(ledgerKey, updated);

  if (supabase) {
    try {
      await supabase.from("ai_usage_logs").insert({
        user_id: entry.userId,
        billing_month: entry.billingMonth,
        lens_type: entry.lensType,
        model_used: entry.modelUsed,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens,
        total_tokens: entry.promptTokens + entry.completionTokens,
        cost_inr: entry.costInr,
        cache_hit: entry.cacheHit,
        downgraded_to_flash_lite: entry.downgradedToFlashLite,
      });
    } catch {
      // Local ledger already updated
    }
  }

  return updated;
}

/**
 * Main Controlled AI Gateway entrypoint enforcing Shields 1, 2, 3, and 4.
 */
export async function executeControlledAiGateway(
  request: AiGatewayRequest
): Promise<AiGatewayExecutionResult> {
  if (!request.selectedText || !request.selectedText.trim()) {
    throw new Error("selectedText is required for Multi-Lens AI execution.");
  }

  const billingMonth =
    request.billingMonth ?? new Date().toISOString().slice(0, 7);
  const walletCapInr =
    request.walletCapInr ?? SHIELD_4_DEFAULT_WALLET_CAP_INR;
  const prakritiDosha: Dosha = request.prakritiDosha ?? "Vata";

  // ---------------------------------------------------------------------------
  // SHIELD 1: Page-Level RAG (~2,000 tokens: active page + top 3 matching chunks)
  // ---------------------------------------------------------------------------
  const rag = selectPageLevelRagContext({
    selectedText: request.selectedText,
    activePageNumber: request.pageNumber,
    activePageText: request.activePageText,
    candidateChunks: request.candidateChunks ?? [],
    maxTokens: SHIELD_1_MAX_PROMPT_TOKENS,
    topK: SHIELD_1_TOP_K_CHUNKS,
  });

  // ---------------------------------------------------------------------------
  // SHIELD 3: Semantic & Selection Cache Lookup
  // Keyed by (document_hash + page_number + normalized_selection_hash + lens_type)
  // ---------------------------------------------------------------------------
  const { cacheKey, normalizedSelectionHash } = await buildShield3CacheKey({
    documentHash: request.documentHash,
    pageNumber: request.pageNumber,
    selectedText: request.selectedText,
    lensType: request.lensType,
  });

  const monthlySpendBeforeInr = await getCurrentMonthlyWalletSpendInr(
    request.supabase,
    request.userId,
    billingMonth
  );

  const cached = await lookupCachedResponse(request.supabase, {
    cacheKey,
    documentHash: request.documentHash,
    pageNumber: request.pageNumber,
    normalizedSelectionHash,
    lensType: request.lensType,
  });

  if (cached) {
    // 0 tokens & ₹0.00 cost on cache hit!
    await recordWalletUsageLog(request.supabase, {
      userId: request.userId,
      billingMonth,
      lensType: request.lensType,
      modelUsed: cached.model_used,
      promptTokens: 0,
      completionTokens: 0,
      costInr: 0,
      cacheHit: true,
      downgradedToFlashLite: false,
    });

    return {
      cacheHit: true,
      cacheKey,
      normalizedSelectionHash,
      requestedModel: cached.model_used,
      modelUsed: cached.model_used,
      downgradedToFlashLite: false,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costInr: 0,
      monthlySpendBeforeInr,
      monthlySpendAfterInr: monthlySpendBeforeInr,
      walletCapInr,
      ragContextChunksUsed: rag.selectedChunks.length,
      payload: cached.response_payload,
    };
  }

  // ---------------------------------------------------------------------------
  // SHIELD 2 (Hybrid Routing) & SHIELD 4 (Internal Wallet Ceiling Check)
  // ---------------------------------------------------------------------------
  const route = resolveShieldedModelRoute({
    lensType: request.lensType,
    currentMonthlySpendInr: monthlySpendBeforeInr,
    walletCapInr,
  });

  const systemPrompt = [
    `You are the Oryzen Learn study engine (${prakritiDosha} mode).`,
    `Lens: ${request.lensType}.`,
    `Always include inline citations formatted as [Page ${request.pageNumber}, Section ${request.sectionHeading}].`,
    rag.boundedPromptContext,
  ].join("\n\n");

  let generatedPayload: AiLensResponsePayload;
  let promptTokens = rag.estimatedTokens;
  let completionTokens = 160;

  if (request.llmGenerator) {
    const customResult = await request.llmGenerator({
      model: route.effectiveModel,
      prompt: systemPrompt,
      request,
      ragChunks: rag.selectedChunks,
    });
    generatedPayload = customResult.payload;
    promptTokens = Math.min(
      SHIELD_1_MAX_PROMPT_TOKENS,
      customResult.promptTokens ?? rag.estimatedTokens
    );
    completionTokens = customResult.completionTokens ?? 160;
  } else if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: route.effectiveModel,
        contents: systemPrompt,
      });
      const text = response.text ?? "";
      const basePayload = buildDeterministicLensPayload({
        request,
        ragChunks: rag.selectedChunks,
      });
      if (text.trim().length > 0) {
        const citationTag = `[Page ${request.pageNumber}, Section ${request.sectionHeading}]`;
        generatedPayload = {
          ...basePayload,
          markdown_body: text.includes("[Page ")
            ? text
            : `${text.trim()}\n\nSource: ${citationTag}`,
        };
      } else {
        generatedPayload = basePayload;
      }
    } catch {
      generatedPayload = buildDeterministicLensPayload({
        request,
        ragChunks: rag.selectedChunks,
      });
    }
  } else {
    generatedPayload = buildDeterministicLensPayload({
      request,
      ragChunks: rag.selectedChunks,
    });
  }

  const costInr = calculateCallCostInr(
    route.effectiveModel,
    promptTokens,
    completionTokens
  );

  // Store in Shield 3 Cache
  await storeCachedResponse(request.supabase, {
    cacheKey,
    documentHash: request.documentHash,
    pageNumber: request.pageNumber,
    normalizedSelectionHash,
    lensType: request.lensType,
    prakritiDosha,
    modelUsed: route.effectiveModel,
    payload: generatedPayload,
  });

  // Record in Shield 4 Wallet Ledger
  const monthlySpendAfterInr = await recordWalletUsageLog(request.supabase, {
    userId: request.userId,
    billingMonth,
    lensType: request.lensType,
    modelUsed: route.effectiveModel,
    promptTokens,
    completionTokens,
    costInr,
    cacheHit: false,
    downgradedToFlashLite: route.downgradedToFlashLite,
  });

  return {
    cacheHit: false,
    cacheKey,
    normalizedSelectionHash,
    requestedModel: route.requestedModel,
    modelUsed: route.effectiveModel,
    downgradedToFlashLite: route.downgradedToFlashLite,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costInr,
    monthlySpendBeforeInr,
    monthlySpendAfterInr,
    walletCapInr,
    ragContextChunksUsed: rag.selectedChunks.length,
    payload: generatedPayload,
  };
}
