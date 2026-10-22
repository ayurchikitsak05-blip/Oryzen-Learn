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
 * - Shield 3 (Semantic & Selection Caching): isolated `cache_key` from cache-policy.ts.
 *   Shared only for institute-authorized syllabus (membership + authorized hash).
 *   Private uploads / notes / prakriti / individualized outputs never share.
 *   Missing table is non-fatal; in-memory hash cache always works.
 * - Shield 4 (Internal Wallet Ledger): Reserve against the ₹70 monthly cap BEFORE
 *   any paid fetch. Concurrent in-flight calls share the reservation ledger.
 *   Over-cap requests get a deterministic fallback — no paid call.
 * - Fallback: preferred provider → next cheapest available key → deterministic compose.
 *   Paid APIs are never called when no provider keys are set.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dosha, HighlightLensType } from "@/lib/prakriti/config";
import type { BoundingBox, CitationReadyChunk } from "@/lib/reader/extractor";
import { computeSha256Hex } from "@/lib/reader/hashing";
import {
  composeDeterministicLensPayload,
  preferTenGroundedMcqs,
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
  APP_CACHE_KEY_VERSION,
  authorizeInstituteAppCache,
  buildIsolatedAppCacheKey,
  callerMayReadCachedEntry,
  type AppCacheAuthorization,
  type AppCacheScope,
  type DocumentClass,
  type InstituteCacheMembership,
} from "./cache-policy";
import {
  MODEL_CATALOG,
  TASK_PREFERRED_MODELS,
  TYPICAL_LENS_INPUT_TOKENS,
  TYPICAL_LENS_OUTPUT_TOKENS,
  type AiProvider,
  type GatewayModelId,
} from "./models";
import {
  callProviderStructuredLens,
  hasAnyPaidProvider,
  planStudyProviderAttempts,
  type ProviderErrorClass,
} from "./providers";
import {
  SHIELD_4_DEFAULT_WALLET_CAP_INR,
  SHIELD_4_SOFT_DOWNGRADE_RATIO,
  calculateCallCostInr,
  canConsumeReservation,
  consumeReservation,
  getCurrentMonthlyWalletSpendInr,
  recordAiUsageObservation,
  recordWalletUsageLog,
  releaseMonthlyAiReservation,
  reservationEstimateForAttempts,
  reserveMonthlyAiBudget,
  clearLocalAiSpendState,
  type SpendClass,
} from "./spend-guard";

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
  StudyGeometry,
  StudyRectangleGeometry,
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
export {
  MODEL_COST_PER_1K_TOKENS_INR,
  SHIELD_4_DEFAULT_WALLET_CAP_INR,
  SHIELD_4_SOFT_DOWNGRADE_RATIO,
  calculateCallCostInr,
  setLocalWalletSpendForUser,
} from "./spend-guard";

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
  concept?: string;
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
  budgetBlocked: boolean;
  cacheScope: AppCacheScope;
  fallbackReason:
    | "missing_gemini_key"
    | "missing_api_key"
    | "model_error"
    | "unusable_model_output"
    | "wallet_exhausted"
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
  documentClass?: DocumentClass;
  instituteMembership?: InstituteCacheMembership | null;
  individualized?: boolean;
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
 *
 * Legacy composite only — do not use for authorization. Gateway lookup
 * uses `buildIsolatedAppCacheKey` so private hashes cannot leak.
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
 * Shield 2 (task map) & Shield 4 (wallet ceiling):
 * - Supported highlight/explain/story/revise/quiz/diagram -> Flash-Lite
 *   (not claimed equal to Flash/Pro quality).
 * - Deep integrative synthesis -> Pro, but only while remaining wallet
 *   stays above the 15% tighter remaining-wallet check (85% used).
 * Hard stop at the ₹70 cap is enforced by reserveMonthlyAiBudget, not here.
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
  const preferred = TASK_PREFERRED_MODELS[params.lensType];
  const requestedModel: GeminiModelTier =
    preferred === "gemini-2.5-pro" ||
    preferred === "gemini-2.5-flash" ||
    preferred === "gemini-2.5-flash-lite"
      ? preferred
      : "gemini-2.5-flash-lite";

  const softProCapReached =
    requestedModel === "gemini-2.5-pro" &&
    params.currentMonthlySpendInr >= walletCap * SHIELD_4_SOFT_DOWNGRADE_RATIO;

  if (softProCapReached) {
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

type MemoryCacheEntry = {
  model_used: GatewayModelId;
  response_payload: AiLensResponsePayload;
  hit_count: number;
  scope: AppCacheScope;
  userId: string;
  tenantId: string;
  revocationEpoch: string;
  cacheVersion: string;
};

const localMemoryResponseCache = new Map<string, MemoryCacheEntry>();

export function clearLocalAiGatewayState(): void {
  localMemoryResponseCache.clear();
  clearLocalAiSpendState();
}

async function lookupCachedResponse(params: {
  supabase: SupabaseClient | null | undefined;
  cacheKey: string;
  shareable: boolean;
  auth: AppCacheAuthorization;
  userId: string;
}): Promise<{
  model_used: GatewayModelId;
  response_payload: AiLensResponsePayload;
} | null> {
  const mem = localMemoryResponseCache.get(params.cacheKey);
  if (mem) {
    if (
      !callerMayReadCachedEntry({
        auth: params.auth,
        userId: params.userId,
        entryScope: mem.scope,
        entryUserId: mem.userId,
        entryTenantId: mem.tenantId,
        entryRevocationEpoch: mem.revocationEpoch,
        entryCacheVersion: mem.cacheVersion,
      })
    ) {
      return null;
    }
    mem.hit_count += 1;
    return {
      model_used: mem.model_used,
      response_payload: mem.response_payload,
    };
  }

  if (params.shareable && params.supabase) {
    try {
      const { data, error } = await params.supabase
        .from("ai_response_cache")
        .select("model_used, response_payload")
        .eq("cache_key", params.cacheKey)
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

  return null;
}

async function storeCachedResponse(params: {
  supabase: SupabaseClient | null | undefined;
  cacheKey: string;
  shareable: boolean;
  scope: AppCacheScope;
  auth: AppCacheAuthorization;
  userId: string;
  documentHash: string;
  pageNumber: number;
  normalizedSelectionHash: string;
  lensType: GatewayTaskType;
  prakritiDosha: Dosha;
  modelUsed: GatewayModelId;
  payload: AiLensResponsePayload;
}): Promise<void> {
  localMemoryResponseCache.set(params.cacheKey, {
    model_used: params.modelUsed,
    response_payload: params.payload,
    hit_count: 1,
    scope: params.scope,
    userId: params.userId,
    tenantId: params.auth.tenantId,
    revocationEpoch: params.auth.revocationEpoch,
    cacheVersion: APP_CACHE_KEY_VERSION,
  });

  if (params.shareable && params.supabase) {
    try {
      await params.supabase.from("ai_response_cache").upsert(
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
        { onConflict: "cache_key" }
      );
    } catch {
      // Local memory cache already updated
    }
  }
}

function spendClassForLens(lensType: GatewayTaskType): SpendClass {
  return lensType === "deep_integrative_synthesis" ? "deep_synthesis" : "standard";
}

function resolveRequestCacheAuth(request: AiGatewayRequest): AppCacheAuthorization {
  return authorizeInstituteAppCache({
    userId: request.userId,
    documentHash: request.documentHash,
    membership: request.instituteMembership,
    documentClass: request.documentClass,
    lensType: request.lensType,
    individualized: request.individualized,
    prakritiDosha: request.individualized
      ? request.prakritiDosha
      : undefined,
  });
}

async function finishGatewayResult(params: {
  request: AiGatewayRequest;
  billingMonth: string;
  walletCapInr: number;
  monthlySpendBeforeInr: number;
  ragChunksUsed: number;
  cacheKey: string;
  cacheScope: AppCacheScope;
  shareable: boolean;
  auth: AppCacheAuthorization;
  normalizedSelectionHash: string;
  requestedModel: GatewayModelId;
  modelUsed: GatewayModelId;
  requestedProvider: AiProvider;
  providerUsed: AiProvider;
  usedProviderFallback: boolean;
  downgradedToFlashLite: boolean;
  promptTokens: number;
  completionTokens: number;
  costInr: number;
  cacheHit: boolean;
  usedDeterministicFallback: boolean;
  budgetBlocked: boolean;
  fallbackReason: AiGatewayExecutionResult["fallbackReason"];
  geminiErrorClass: GeminiErrorClass | null;
  providerErrorClass: ProviderErrorClass | null;
  payload: AiLensResponsePayload;
}): Promise<AiGatewayExecutionResult> {
  if (!params.cacheHit) {
    await storeCachedResponse({
      supabase: params.request.supabase,
      cacheKey: params.cacheKey,
      shareable: params.shareable,
      scope: params.cacheScope,
      auth: params.auth,
      userId: params.request.userId,
      documentHash: params.request.documentHash,
      pageNumber: params.request.pageNumber,
      normalizedSelectionHash: params.normalizedSelectionHash,
      lensType: params.request.lensType,
      prakritiDosha: params.request.prakritiDosha ?? "Vata",
      modelUsed: params.modelUsed,
      payload: params.payload,
    });
  }

  const monthlySpendAfterInr = await recordWalletUsageLog(params.request.supabase, {
    userId: params.request.userId,
    billingMonth: params.billingMonth,
    lensType: params.request.lensType,
    modelUsed: params.modelUsed,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    costInr: params.costInr,
    cacheHit: params.cacheHit,
    downgradedToFlashLite: params.downgradedToFlashLite,
  });

  recordAiUsageObservation(params.request.userId, {
    billingMonth: params.billingMonth,
    provider: params.providerUsed,
    model: params.modelUsed,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    costInr: params.costInr,
    success: !params.usedDeterministicFallback && !params.budgetBlocked,
    fallback: params.usedDeterministicFallback || params.usedProviderFallback,
    cacheHit: params.cacheHit,
    budgetBlocked: params.budgetBlocked,
  });

  return {
    cacheHit: params.cacheHit,
    cacheKey: params.cacheKey,
    cacheScope: params.cacheScope,
    normalizedSelectionHash: params.normalizedSelectionHash,
    requestedModel: params.requestedModel,
    modelUsed: params.modelUsed,
    requestedProvider: params.requestedProvider,
    providerUsed: params.providerUsed,
    usedProviderFallback: params.usedProviderFallback,
    downgradedToFlashLite: params.downgradedToFlashLite,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.promptTokens + params.completionTokens,
    costInr: params.costInr,
    monthlySpendBeforeInr: params.monthlySpendBeforeInr,
    monthlySpendAfterInr,
    walletCapInr: params.walletCapInr,
    ragContextChunksUsed: params.ragChunksUsed,
    usedDeterministicFallback: params.usedDeterministicFallback,
    budgetBlocked: params.budgetBlocked,
    fallbackReason: params.fallbackReason,
    geminiErrorClass: params.geminiErrorClass,
    providerErrorClass: params.providerErrorClass,
    payload: params.payload,
  };
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
  const cacheAuth = resolveRequestCacheAuth(request);

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

  const route = resolveShieldedModelRoute({
    lensType: request.lensType,
    currentMonthlySpendInr: monthlySpendBeforeInr,
    walletCapInr,
  });
  const preferredModel = route.effectiveModel;
  const attempts = planStudyProviderAttempts(preferredModel);
  const plannedProvider: AiProvider = attempts[0]?.provider ?? "deterministic";
  const requestedProvider: AiProvider =
    MODEL_CATALOG[route.requestedModel].provider;

  const normalizedSelectionHash = await computeNormalizedSelectionHash(
    request.selectedText
  );
  const isolated = await buildIsolatedAppCacheKey({
    auth: cacheAuth,
    userId: request.userId,
    documentHash: request.documentHash,
    pageNumber: request.pageNumber,
    selectionHash: normalizedSelectionHash,
    lensType: request.lensType,
  });

  const cached = await lookupCachedResponse({
    supabase: request.supabase,
    cacheKey: isolated.cacheKey,
    shareable: isolated.shareable,
    auth: cacheAuth,
    userId: request.userId,
  });

  if (cached) {
    return finishGatewayResult({
      request,
      billingMonth,
      walletCapInr,
      monthlySpendBeforeInr,
      ragChunksUsed: rag.selectedChunks.length,
      cacheKey: isolated.cacheKey,
      cacheScope: isolated.scope,
      shareable: isolated.shareable,
      auth: cacheAuth,
      normalizedSelectionHash,
      requestedModel: cached.model_used,
      modelUsed: cached.model_used,
      requestedProvider,
      providerUsed: cached.response_payload.used_fallback
        ? "deterministic"
        : plannedProvider,
      usedProviderFallback: false,
      downgradedToFlashLite: false,
      promptTokens: 0,
      completionTokens: 0,
      costInr: 0,
      cacheHit: true,
      usedDeterministicFallback: Boolean(cached.response_payload.used_fallback),
      budgetBlocked: false,
      fallbackReason: cached.response_payload.used_fallback
        ? "missing_api_key"
        : null,
      geminiErrorClass: cached.response_payload.used_fallback
        ? "missing_key"
        : null,
      providerErrorClass: cached.response_payload.used_fallback
        ? "missing_key"
        : null,
      payload: cached.response_payload,
    });
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

  const promptEst = Math.max(rag.estimatedTokens, TYPICAL_LENS_INPUT_TOKENS);
  const completionEst = TYPICAL_LENS_OUTPUT_TOKENS;
  const reserveEstimate = reservationEstimateForAttempts(
    [
      preferredModel,
      ...attempts.map((item) => item.model),
    ],
    promptEst,
    completionEst,
    walletCapInr - monthlySpendBeforeInr
  );
  const decision = reserveMonthlyAiBudget({
    userId: request.userId,
    billingMonth,
    spentInr: monthlySpendBeforeInr,
    estimateInr: reserveEstimate,
    capInr: walletCapInr,
    spendClass: spendClassForLens(request.lensType),
  });

  let generatedPayload: AiLensResponsePayload = fallbackPayload;
  let usedDeterministicFallback = true;
  let usedProviderFallback = false;
  let budgetBlocked = false;
  let fallbackReason: AiGatewayExecutionResult["fallbackReason"] =
    requestedProvider === "google" ? "missing_gemini_key" : "missing_api_key";
  let geminiErrorClass: GeminiErrorClass | null = "missing_key";
  let providerErrorClass: ProviderErrorClass | null = "missing_key";
  let providerUsed: AiProvider = "deterministic";
  let modelUsed: GatewayModelId = "deterministic";
  let promptTokens = 0;
  let completionTokens = 0;
  let costInr = 0;

  const applyDeterministic = (
    reason: AiGatewayExecutionResult["fallbackReason"],
    blocked: boolean
  ) => {
    generatedPayload = fallbackPayload;
    usedDeterministicFallback = true;
    usedProviderFallback = false;
    budgetBlocked = blocked;
    fallbackReason = reason;
    geminiErrorClass = blocked ? null : "missing_key";
    providerErrorClass = blocked ? null : "missing_key";
    providerUsed = "deterministic";
    modelUsed = "deterministic";
    promptTokens = 0;
    completionTokens = 0;
    costInr = 0;
  };

  if (!decision.allowed) {
    applyDeterministic("wallet_exhausted", true);
  } else {
    try {
      if (request.llmGenerator) {
        const generatorEstimate = reserveEstimate;
        if (!canConsumeReservation(decision.reservation, generatorEstimate)) {
          applyDeterministic("wallet_exhausted", true);
        } else {
          const customResult = await request.llmGenerator({
            model: route.effectiveModel,
            prompt: systemPrompt,
            request,
            ragChunks: rag.selectedChunks,
          });
          generatedPayload = {
            ...fallbackPayload,
            ...customResult.payload,
            mcqs: preferTenGroundedMcqs(
              customResult.payload.mcqs,
              fallbackPayload.mcqs
            ),
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
          costInr = calculateCallCostInr(modelUsed, promptTokens, completionTokens);
          consumeReservation(decision.reservation, costInr);
        }
      } else if (hasAnyPaidProvider()) {
        let lastClass: ProviderErrorClass = "unknown";
        let attemptedPaid = false;
        for (const [index, attempt] of attempts.entries()) {
          const nextEstimate = calculateCallCostInr(
            attempt.model,
            promptEst,
            completionEst
          );
          if (!canConsumeReservation(decision.reservation, nextEstimate)) {
            continue;
          }
          attemptedPaid = true;
          const modeled = await callProviderStructuredLens({
            provider: attempt.provider,
            model: attempt.model,
            prompt: systemPrompt,
            fallback: fallbackPayload,
            fetchImpl: request.fetchImpl,
          });
          const attemptCost = calculateCallCostInr(
            attempt.model,
            modeled.promptTokens ?? 0,
            modeled.completionTokens ?? 0
          );
          consumeReservation(decision.reservation, attemptCost);
          lastClass = modeled.errorClass ?? "unknown";
          if (modeled.errorClass === null) {
            generatedPayload = {
              ...modeled.payload,
              mcqs: preferTenGroundedMcqs(modeled.payload.mcqs, fallbackPayload.mcqs),
              revision: modeled.payload.revision ?? fallbackPayload.revision,
            };
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
            costInr = calculateCallCostInr(modelUsed, promptTokens, completionTokens);
            break;
          }
        }
        if (usedDeterministicFallback) {
          applyDeterministic(
            !attemptedPaid
              ? "wallet_exhausted"
              : lastClass === "unusable_output"
                ? "unusable_model_output"
                : lastClass === "missing_key"
                  ? requestedProvider === "google"
                    ? "missing_gemini_key"
                    : "missing_api_key"
                  : "model_error",
            !attemptedPaid
          );
          if (!attemptedPaid) {
            budgetBlocked = true;
          }
        }
      } else {
        applyDeterministic(
          requestedProvider === "google" ? "missing_gemini_key" : "missing_api_key",
          false
        );
      }
    } finally {
      releaseMonthlyAiReservation(decision.reservation);
    }
  }

  return finishGatewayResult({
    request,
    billingMonth,
    walletCapInr,
    monthlySpendBeforeInr,
    ragChunksUsed: rag.selectedChunks.length,
    cacheKey: isolated.cacheKey,
    cacheScope: isolated.scope,
    shareable: isolated.shareable,
    auth: cacheAuth,
    normalizedSelectionHash,
    requestedModel: route.requestedModel,
    modelUsed,
    requestedProvider,
    providerUsed,
    usedProviderFallback,
    downgradedToFlashLite: route.downgradedToFlashLite,
    promptTokens,
    completionTokens,
    costInr,
    cacheHit: false,
    usedDeterministicFallback,
    budgetBlocked,
    fallbackReason,
    geminiErrorClass,
    providerErrorClass,
    payload: generatedPayload,
  });
}
