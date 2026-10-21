/**
 * Layer 3: Controlled AI Gateway & 5-Shield Profit Protection System
 *
 * Provider-independent: openai | google | mistral | deterministic.
 * Student UI still calls /api/ai/lens with the same lens ids.
 *
 * Implements:
 * - Shield 1 (Page-Level RAG): Active page text + top 3 matching chunks (~2,000 token budget).
 * - Shield 2 (Task→model map): standard highlight lenses -> preferred Flash-class model,
 *   deep integrative tasks -> Pro-class. Not locked to Gemini when another key is set.
 * - Shield 3 (Semantic & Selection Caching): `ai_response_cache` keyed by
 *   `(document_hash + page_number + normalized_selection_hash + lens_type + provider)`.
 *   Missing table is non-fatal; in-memory hash cache always works.
 * - Shield 4 (Internal Wallet Ledger): Tracks token costs in `ai_usage_logs` against a hard
 *   monthly INR cap (e.g., ₹70.00), automatically falling back to the cheapest configured model.
 * - Fallback: preferred provider → next cheapest available key → deterministic compose.
 *   Paid APIs are never called when no provider keys are set.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dosha, HighlightLensType } from "@/lib/prakriti/config";
import type { BoundingBox, CitationReadyChunk } from "@/lib/reader/extractor";
import { computeSha256Hex } from "@/lib/reader/hashing";
import {
  composeDeterministicLensPayload,
  type AnalogySections,
  type ExplainSections,
  type IllustrativeBundle,
  type RevisionSections,
  type ShortAnswerItem,
  type StorySections,
  type StudyDiagram,
} from "./lens-compose";
import type { GeminiErrorClass } from "./gemini-structured";
import {
  MODEL_CATALOG,
  TASK_PREFERRED_MODELS,
  listPriceUsd,
  usdToInrEstimate,
  type AiProvider,
  type GatewayModelId,
} from "./models";
import {
  callProviderStructuredLens,
  hasAnyPaidProvider,
  planProviderAttempts,
  type ProviderErrorClass,
} from "./providers";

export type {
  AnalogySections,
  ExplainSections,
  IllustrativeBundle,
  RevisionSections,
  ShortAnswerItem,
  StorySections,
  StudyDiagram,
  StudyDiagramEdge,
  StudyDiagramKind,
  StudyDiagramNode,
} from "./lens-compose";
export type { GeminiErrorClass } from "./gemini-structured";
export type { AiProvider, GatewayModelId } from "./models";
export type { ProviderErrorClass } from "./providers";

export type GatewayTaskType =
  | HighlightLensType
  | "deep_integrative_synthesis";

export type GeminiModelTier = Extract<
  GatewayModelId,
  "gemini-2.5-flash" | "gemini-2.5-pro" | "gemini-2.5-flash-lite"
>;

export const SHIELD_1_MAX_PROMPT_TOKENS = 2000;
export const SHIELD_1_TOP_K_CHUNKS = 3;
export const SHIELD_4_DEFAULT_WALLET_CAP_INR = 70.0;
export const SHIELD_4_SOFT_DOWNGRADE_RATIO = 0.85;

/**
 * Per-1,000-token internal INR cost rates for Shield 4 wallet ledger accounting.
 */
export const MODEL_COST_PER_1K_TOKENS_INR: Record<
  GatewayModelId,
  { inputInr: number; outputInr: number }
> = {
  "gemini-2.5-pro": { inputInr: 0.14, outputInr: 0.42 },
  "gemini-2.5-flash": { inputInr: 0.018, outputInr: 0.054 },
  "gemini-2.5-flash-lite": { inputInr: 0.006, outputInr: 0.018 },
  "gpt-6-luna": { inputInr: 0.0094, outputInr: 0.0472 },
  "ministral-3b-2512": { inputInr: 0.0094, outputInr: 0.0094 },
  deterministic: { inputInr: 0, outputInr: 0 },
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
  short_answers?: ShortAnswerItem[];
  citations: InlineCitationCoordinate[];
  diagram?: StudyDiagram;
  explain?: ExplainSections;
  revision?: RevisionSections;
  illustrative?: IllustrativeBundle;
  analogy?: AnalogySections;
  story?: StorySections;
  used_fallback?: boolean;
}

export interface AiGatewayExecutionResult {
  cacheHit: boolean;
  cacheKey: string;
  normalizedSelectionHash: string;
  requestedModel: GatewayModelId;
  modelUsed: GatewayModelId;
  requestedProvider: AiProvider;
  providerUsed: AiProvider;
  usedProviderFallback: boolean;
  downgradedToFlashLite: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costInr: number;
  monthlySpendBeforeInr: number;
  monthlySpendAfterInr: number;
  walletCapInr: number;
  ragContextChunksUsed: number;
  usedDeterministicFallback: boolean;
  fallbackReason:
    | "missing_gemini_key"
    | "missing_api_key"
    | "model_error"
    | "unusable_model_output"
    | null;
  geminiErrorClass: GeminiErrorClass | null;
  providerErrorClass: ProviderErrorClass | null;
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
    model: GatewayModelId;
    prompt: string;
    request: AiGatewayRequest;
    ragChunks: CitationReadyChunk[];
  }) => Promise<{
    payload: AiLensResponsePayload;
    promptTokens?: number;
    completionTokens?: number;
  }>;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
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
  provider?: AiProvider;
}): Promise<{ cacheKey: string; normalizedSelectionHash: string }> {
  const normalizedSelectionHash = await computeNormalizedSelectionHash(
    params.selectedText
  );
  const providerPart = params.provider ? `|provider:${params.provider}` : "";
  const rawComposite = `${params.documentHash.trim().toLowerCase()}|p:${
    params.pageNumber
  }|sel:${normalizedSelectionHash}|lens:${params.lensType}${providerPart}`;
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
  model: GatewayModelId,
  promptTokens: number,
  completionTokens: number
): number {
  const rates = MODEL_COST_PER_1K_TOKENS_INR[model];
  if (rates) {
    const cost =
      (promptTokens / 1000) * rates.inputInr +
      (completionTokens / 1000) * rates.outputInr;
    return Number(cost.toFixed(4));
  }
  return Number(
    usdToInrEstimate(listPriceUsd(model, promptTokens, completionTokens)).toFixed(4)
  );
}

/**
 * Builds structured, citation-grounded lens output tailored to the student's Prakriti Dosha
 * and active highlight lens, ensuring every output includes clickable `[Page X, Section Y]` inline citations.
 */
export function buildDeterministicLensPayload(params: {
  request: AiGatewayRequest;
  ragChunks: CitationReadyChunk[];
}): AiLensResponsePayload {
  return composeDeterministicLensPayload(params);
}

// In-memory fallback stores for Shield 3 Cache & Shield 4 Wallet Ledger when Supabase is offline or in local tests
const localMemoryResponseCache = new Map<
  string,
  {
    model_used: GatewayModelId;
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
  model_used: GatewayModelId;
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
          model_used: data.model_used as GatewayModelId,
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
    modelUsed: GatewayModelId;
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
    modelUsed: GatewayModelId;
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

  const monthlySpendBeforeInr = await getCurrentMonthlyWalletSpendInr(
    request.supabase,
    request.userId,
    billingMonth
  );

  // ---------------------------------------------------------------------------
  // SHIELD 2 (Task map) & SHIELD 4 (Internal Wallet Ceiling Check)
  // ---------------------------------------------------------------------------
  const route = resolveShieldedModelRoute({
    lensType: request.lensType,
    currentMonthlySpendInr: monthlySpendBeforeInr,
    walletCapInr,
  });
  const preferredModel =
    route.downgradedToFlashLite
      ? "gemini-2.5-flash-lite"
      : TASK_PREFERRED_MODELS[request.lensType];
  const attempts = planProviderAttempts(preferredModel);
  const plannedProvider: AiProvider = attempts[0]?.provider ?? "deterministic";
  const requestedProvider: AiProvider =
    MODEL_CATALOG[route.requestedModel].provider;

  // ---------------------------------------------------------------------------
  // SHIELD 3: Semantic & Selection Cache Lookup
  // Keyed by document + page + selection + lens + provider
  // ---------------------------------------------------------------------------
  const { cacheKey, normalizedSelectionHash } = await buildShield3CacheKey({
    documentHash: request.documentHash,
    pageNumber: request.pageNumber,
    selectedText: request.selectedText,
    lensType: request.lensType,
    provider: plannedProvider,
  });

  const cached = await lookupCachedResponse(request.supabase, {
    cacheKey,
    documentHash: request.documentHash,
    pageNumber: request.pageNumber,
    normalizedSelectionHash,
    lensType: request.lensType,
  });

  if (cached) {
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

    const cachedFallback = Boolean(cached.response_payload.used_fallback);
    return {
      cacheHit: true,
      cacheKey,
      normalizedSelectionHash,
      requestedModel: cached.model_used,
      modelUsed: cached.model_used,
      requestedProvider,
      providerUsed: cachedFallback ? "deterministic" : plannedProvider,
      usedProviderFallback: false,
      downgradedToFlashLite: false,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costInr: 0,
      monthlySpendBeforeInr,
      monthlySpendAfterInr: monthlySpendBeforeInr,
      walletCapInr,
      ragContextChunksUsed: rag.selectedChunks.length,
      usedDeterministicFallback: cachedFallback,
      fallbackReason: cachedFallback ? "missing_api_key" : null,
      geminiErrorClass: cachedFallback ? "missing_key" : null,
      providerErrorClass: cachedFallback ? "missing_key" : null,
      payload: cached.response_payload,
    };
  }

  const systemPrompt = [
    `You are the Oryzen Learn study engine.`,
    `Lens: ${request.lensType}.`,
    `Explain only the selected passage. Do not invent facts beyond it.`,
    `Do not insert Ayurveda, doshas, or constitution theory unless the passage itself is about those topics.`,
    `Return JSON matching the study lens schema. Diagrams must use nodes and edges, not mermaid or arrow prose.`,
    `Never use image generation for ordinary diagrams.`,
    `Never reprint the entire source passage.`,
    rag.boundedPromptContext,
  ].join("\n\n");

  const fallbackPayload = buildDeterministicLensPayload({
    request,
    ragChunks: rag.selectedChunks,
  });

  let generatedPayload: AiLensResponsePayload = fallbackPayload;
  let usedDeterministicFallback = true;
  let usedProviderFallback = false;
  let fallbackReason: AiGatewayExecutionResult["fallbackReason"] =
    requestedProvider === "google" ? "missing_gemini_key" : "missing_api_key";
  let geminiErrorClass: GeminiErrorClass | null = "missing_key";
  let providerErrorClass: ProviderErrorClass | null = "missing_key";
  let providerUsed: AiProvider = "deterministic";
  let modelUsed: GatewayModelId = route.effectiveModel;
  let promptTokens = rag.estimatedTokens;
  let completionTokens = 160;

  if (request.llmGenerator) {
    const customResult = await request.llmGenerator({
      model: route.effectiveModel,
      prompt: systemPrompt,
      request,
      ragChunks: rag.selectedChunks,
    });
    generatedPayload = {
      ...fallbackPayload,
      ...customResult.payload,
      mcqs: customResult.payload.mcqs ?? fallbackPayload.mcqs,
      short_answers:
        customResult.payload.short_answers ?? fallbackPayload.short_answers,
      diagram: customResult.payload.diagram ?? fallbackPayload.diagram,
      explain: customResult.payload.explain ?? fallbackPayload.explain,
      revision: customResult.payload.revision ?? fallbackPayload.revision,
      illustrative:
        customResult.payload.illustrative ?? fallbackPayload.illustrative,
      story: customResult.payload.story ?? fallbackPayload.story,
      used_fallback: false,
    };
    usedDeterministicFallback = false;
    fallbackReason = null;
    geminiErrorClass = null;
    providerErrorClass = null;
    providerUsed = requestedProvider;
    modelUsed = route.effectiveModel;
    promptTokens = Math.min(
      SHIELD_1_MAX_PROMPT_TOKENS,
      customResult.promptTokens ?? rag.estimatedTokens
    );
    completionTokens = customResult.completionTokens ?? 160;
  } else if (hasAnyPaidProvider()) {
    let lastClass: ProviderErrorClass = "unknown";
    for (const [index, attempt] of attempts.entries()) {
      const modeled = await callProviderStructuredLens({
        provider: attempt.provider,
        model: attempt.model,
        prompt: systemPrompt,
        fallback: fallbackPayload,
        fetchImpl: request.fetchImpl,
      });
      lastClass = modeled.errorClass ?? "unknown";
      if (modeled.errorClass === null) {
        generatedPayload = modeled.payload;
        usedDeterministicFallback = false;
        usedProviderFallback = index > 0;
        fallbackReason = null;
        geminiErrorClass = null;
        providerErrorClass = null;
        providerUsed = attempt.provider;
        modelUsed = attempt.model;
        promptTokens = Math.min(
          SHIELD_1_MAX_PROMPT_TOKENS,
          modeled.promptTokens ?? rag.estimatedTokens
        );
        completionTokens = modeled.completionTokens ?? 160;
        break;
      }
    }
    if (usedDeterministicFallback) {
      generatedPayload = fallbackPayload;
      providerUsed = "deterministic";
      modelUsed = "deterministic";
      providerErrorClass = lastClass;
      geminiErrorClass = lastClass;
      fallbackReason =
        lastClass === "unusable_output"
          ? "unusable_model_output"
          : lastClass === "missing_key"
            ? requestedProvider === "google"
              ? "missing_gemini_key"
              : "missing_api_key"
            : "model_error";
    }
  } else {
    generatedPayload = fallbackPayload;
    usedDeterministicFallback = true;
    fallbackReason =
      requestedProvider === "google" ? "missing_gemini_key" : "missing_api_key";
    geminiErrorClass = "missing_key";
    providerErrorClass = "missing_key";
    providerUsed = "deterministic";
    modelUsed = "deterministic";
  }

  const costInr = calculateCallCostInr(modelUsed, promptTokens, completionTokens);

  await storeCachedResponse(request.supabase, {
    cacheKey,
    documentHash: request.documentHash,
    pageNumber: request.pageNumber,
    normalizedSelectionHash,
    lensType: request.lensType,
    prakritiDosha,
    modelUsed,
    payload: generatedPayload,
  });

  const monthlySpendAfterInr = await recordWalletUsageLog(request.supabase, {
    userId: request.userId,
    billingMonth,
    lensType: request.lensType,
    modelUsed,
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
    modelUsed,
    requestedProvider,
    providerUsed,
    usedProviderFallback,
    downgradedToFlashLite: route.downgradedToFlashLite,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costInr,
    monthlySpendBeforeInr,
    monthlySpendAfterInr,
    walletCapInr,
    ragContextChunksUsed: rag.selectedChunks.length,
    usedDeterministicFallback,
    fallbackReason,
    geminiErrorClass,
    providerErrorClass,
    payload: generatedPayload,
  };
}
