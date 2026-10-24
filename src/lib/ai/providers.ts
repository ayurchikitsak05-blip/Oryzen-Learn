import type { AiLensResponsePayload } from "./gateway";
import { mergeStructuredLensPayload } from "./gemini-structured";
import {
  CHEAPEST_PROVIDER_ORDER,
  CHEAP_EXTRACTIVE_FALLBACK_PROVIDER,
  MODEL_CATALOG,
  QUALITY_FALLBACK_PROVIDER,
  modelForProvider,
  type AiProvider,
  type GatewayModelId,
  type PaidAiProvider,
} from "./models";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateCallCostInr,
  canConsumeReservation,
  consumeReservation,
  getCurrentMonthlyWalletSpendInr,
  recordWalletUsageLog,
  releaseMonthlyAiReservation,
  reservationEstimateForAttempts,
  reserveMonthlyAiBudget,
  recordAiUsageObservation,
  settleMonthlyAiReservation,
  SHIELD_4_DEFAULT_WALLET_CAP_INR,
  type SpendClass,
} from "./spend-guard";

export const PROVIDER_CALL_TIMEOUT_MS = 20_000;
export const PROVIDER_MAX_ATTEMPTS = 2;

export type ProviderErrorClass =
  | "missing_key"
  | "billing"
  | "quota"
  | "auth"
  | "timeout"
  | "safety"
  | "unusable_output"
  | "unknown";

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<Response>;

export interface ProviderAttempt {
  provider: PaidAiProvider;
  model: GatewayModelId;
  officialId: string;
}

export interface SanitizedProviderError {
  httpStatus: number | null;
  googleStatus: string | null;
  message: string;
  errorClass: ProviderErrorClass;
}

export interface ProviderCallResult {
  payload: AiLensResponsePayload;
  promptTokens?: number;
  completionTokens?: number;
  errorClass: ProviderErrorClass | null;
  errorDetail: SanitizedProviderError | null;
  provider: AiProvider;
  model: GatewayModelId;
}

export interface EnvPresence {
  name: string;
  status: "SET" | "EMPTY";
}

function trimmedEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function describeAiEnvPresence(): EnvPresence[] {
  return [
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
  ].map((name) => ({
    name,
    status: trimmedEnv(name) ? "SET" : "EMPTY",
  }));
}

export function googleApiKey(): string {
  return trimmedEnv("GEMINI_API_KEY") || trimmedEnv("GOOGLE_GENERATIVE_AI_API_KEY");
}

export function openaiApiKey(): string {
  return trimmedEnv("OPENAI_API_KEY");
}

export function mistralApiKey(): string {
  return trimmedEnv("MISTRAL_API_KEY");
}

export function aiGatewayApiKey(): string {
  return trimmedEnv("AI_GATEWAY_API_KEY");
}

export function hasUsableGoogleKey(): boolean {
  return Boolean(googleApiKey());
}

export async function listGoogleModelIds(fetchImpl?: FetchLike): Promise<string[]> {
  const key = googleApiKey();
  if (!key) return [];
  const fetchFn = fetchImpl ?? (fetch as FetchLike);
  const ids: string[] = [];
  let pageToken = "";
  for (let page = 0; page < 8; page += 1) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchFn(url.toString(), {
      method: "GET",
      headers: {
        "x-goog-api-key": key,
      },
    });
    const json = (await response.json()) as {
      models?: Array<{ name?: string }>;
      nextPageToken?: string;
      error?: { status?: string; message?: string; code?: number };
    };
    if (!response.ok) {
      const status = json.error?.status ?? "UNKNOWN";
      const message = stripSecretsFromMessage(String(json.error?.message ?? "")).slice(0, 180);
      throw new Error(`HTTP ${response.status} ${status} ${message}`.trim());
    }
    for (const row of json.models ?? []) {
      const id = String(row.name ?? "").replace(/^models\//, "");
      if (id) ids.push(id);
    }
    pageToken = String(json.nextPageToken ?? "");
    if (!pageToken) break;
  }
  return Array.from(new Set(ids));
}

export function hasUsableOpenAiKey(): boolean {
  return Boolean(openaiApiKey());
}

export function hasUsableMistralKey(): boolean {
  return Boolean(mistralApiKey());
}

/** Explicit gateway key only — OIDC alone must not spend credits. */
export function hasExplicitAiGatewayKey(): boolean {
  return Boolean(aiGatewayApiKey());
}

export function availablePaidProviders(): PaidAiProvider[] {
  const found: PaidAiProvider[] = [];
  if (hasUsableMistralKey() || hasExplicitAiGatewayKey()) found.push("mistral");
  if (hasUsableGoogleKey() || hasExplicitAiGatewayKey()) found.push("google");
  if (hasUsableOpenAiKey() || hasExplicitAiGatewayKey()) found.push("openai");
  return found;
}

export function hasAnyPaidProvider(): boolean {
  return availablePaidProviders().length > 0;
}

export function planProviderAttempts(
  preferredModel: GatewayModelId
): ProviderAttempt[] {
  const preferredProvider = MODEL_CATALOG[preferredModel].provider;
  const available = availablePaidProviders();
  if (available.length === 0) return [];

  const ordered: PaidAiProvider[] = [];
  if (preferredProvider !== "deterministic" && available.includes(preferredProvider)) {
    ordered.push(preferredProvider);
  }
  for (const provider of CHEAPEST_PROVIDER_ORDER) {
    if (!ordered.includes(provider) && available.includes(provider)) {
      ordered.push(provider);
    }
  }

  return ordered.map((provider) => {
    const model = modelForProvider(provider, preferredModel);
    return {
      provider,
      model,
      officialId: MODEL_CATALOG[model].officialId,
    };
  });
}

/**
 * Study-task fallback order: preferred → Luna (quality) → Ministral (cheap extractive).
 * Flash-Lite is not treated as equal to Flash or Pro.
 */
export function planStudyProviderAttempts(
  preferredModel: GatewayModelId
): ProviderAttempt[] {
  const preferredProvider = MODEL_CATALOG[preferredModel].provider;
  const available = availablePaidProviders();
  if (available.length === 0) return [];

  const ordered: PaidAiProvider[] = [];
  if (preferredProvider !== "deterministic" && available.includes(preferredProvider)) {
    ordered.push(preferredProvider);
  }
  if (
    available.includes(QUALITY_FALLBACK_PROVIDER) &&
    !ordered.includes(QUALITY_FALLBACK_PROVIDER)
  ) {
    ordered.push(QUALITY_FALLBACK_PROVIDER);
  }
  if (
    available.includes(CHEAP_EXTRACTIVE_FALLBACK_PROVIDER) &&
    !ordered.includes(CHEAP_EXTRACTIVE_FALLBACK_PROVIDER)
  ) {
    ordered.push(CHEAP_EXTRACTIVE_FALLBACK_PROVIDER);
  }
  for (const provider of available) {
    if (!ordered.includes(provider)) ordered.push(provider);
  }

  return ordered.map((provider) => {
    const model = modelForProvider(provider, preferredModel);
    return {
      provider,
      model,
      officialId: MODEL_CATALOG[model].officialId,
    };
  });
}

export const LENS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    markdown_body: { type: "string" },
    key_points: { type: "array", items: { type: "string" } },
    explain: {
      type: "object",
      additionalProperties: false,
      properties: {
        simpleExplanation: { type: "string" },
        standardExplanation: { type: "string" },
        deeperExplanation: { type: "string" },
        importantConcepts: { type: "array", items: { type: "string" } },
        relevantExample: { type: "string" },
        keyTakeaway: { type: "string" },
      },
      required: [
        "simpleExplanation",
        "standardExplanation",
        "deeperExplanation",
        "importantConcepts",
        "relevantExample",
        "keyTakeaway",
      ],
    },
    story: {
      type: "object",
      additionalProperties: false,
      properties: {
        opening: { type: "string" },
        turningPoint: { type: "string" },
        close: { type: "string" },
      },
      required: ["opening", "turningPoint", "close"],
    },
    revision: {
      type: "object",
      additionalProperties: false,
      properties: {
        quickSummary: { type: "string" },
        keyPoints: { type: "array", items: { type: "string" } },
        revisionTable: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              topic: { type: "string" },
              remember: { type: "string" },
            },
            required: ["topic", "remember"],
          },
        },
        memoryAid: { type: "string" },
        examPractice: { type: "array", items: { type: "string" } },
      },
      required: [
        "quickSummary",
        "keyPoints",
        "revisionTable",
        "memoryAid",
        "examPractice",
      ],
    },
    analogy: {
      type: "object",
      additionalProperties: false,
      properties: {
        setup: { type: "string" },
        mapping: { type: "string" },
        takeaway: { type: "string" },
      },
      required: ["setup", "mapping", "takeaway"],
    },
    diagram: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        kind: { type: "string" },
        nodes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
            },
            required: ["id", "label"],
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: "string" },
            },
            required: ["from", "to"],
          },
        },
      },
      required: ["title", "nodes", "edges"],
    },
    illustrative: {
      type: "object",
      additionalProperties: false,
      properties: {
        flowchart: { $ref: "#/properties/diagram" },
        mindMap: { $ref: "#/properties/diagram" },
        conceptDiagram: { $ref: "#/properties/diagram" },
        analogy: { $ref: "#/properties/analogy" },
      },
      required: ["flowchart", "mindMap", "conceptDiagram", "analogy"],
    },
    mcqs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
          explanation: { type: "string" },
          citationLabel: { type: "string" },
        },
        required: ["question", "options", "correctIndex", "explanation"],
      },
    },
    short_answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: { type: "string" },
          expectedPoints: { type: "array", items: { type: "string" } },
          sampleAnswer: { type: "string" },
        },
        required: ["prompt", "sampleAnswer"],
      },
    },
    askMyBook: {
      type: "object",
      additionalProperties: false,
      properties: {
        question: { type: "string" },
        answer: { type: "string" },
        sufficientSource: { type: "boolean" },
      },
      required: ["question", "answer", "sufficientSource"],
    },
  },
  required: ["title", "markdown_body", "key_points"],
} as const;

function geminiRestSchema(): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      markdown_body: { type: "STRING" },
      key_points: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["title", "markdown_body", "key_points"],
  };
}

async function withTimeout<T>(
  ms: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("timeout");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonContent(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(fenced) as unknown;
}

function stripSecretsFromMessage(message: string): string {
  return message
    .replace(/key=[^&\s]+/gi, "key=redacted")
    .replace(/Bearer\s+\S+/gi, "Bearer redacted")
    .replace(/x-goog-api-key["\s:=]+[^"\s]+/gi, "x-goog-api-key=[redacted]")
    .replace(/AIza[0-9A-Za-z_\-]{6,}/g, "[redacted]");
}

function googleErrorFields(text: string): { status: string | null; message: string | null } {
  try {
    const parsed = JSON.parse(text) as {
      error?: { status?: string; message?: string; code?: number };
    };
    const status = parsed.error?.status ? String(parsed.error.status) : null;
    const message = parsed.error?.message
      ? stripSecretsFromMessage(String(parsed.error.message)).slice(0, 180)
      : null;
    return { status, message };
  } catch {
    return { status: null, message: null };
  }
}

export function sanitizeProviderError(error: unknown): SanitizedProviderError {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "unknown";
  const sanitized = stripSecretsFromMessage(text);
  const httpMatch = sanitized.match(/HTTP\s+(\d{3})/i);
  const statusMatch = sanitized.match(
    /\b(INVALID_ARGUMENT|FAILED_PRECONDITION|PERMISSION_DENIED|UNAUTHENTICATED|NOT_FOUND|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL|CANCELLED)\b/
  );
  return {
    httpStatus: httpMatch ? Number(httpMatch[1]) : null,
    googleStatus: statusMatch ? statusMatch[1] : null,
    message: sanitized.slice(0, 240),
    errorClass: classifyProviderError(error),
  };
}

export function classifyProviderError(error: unknown): ProviderErrorClass {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "unknown";
  const compact = text.toLowerCase();
  const httpMatch = text.match(/HTTP\s+(\d{3})/i);
  const httpStatus = httpMatch ? Number(httpMatch[1]) : null;
  if (/abort|timeout|timed out|deadline_exceeded|504|499/i.test(compact)) {
    return "timeout";
  }
  if (
    httpStatus === 429 ||
    httpStatus === 402 ||
    /quota|resource.?exhausted|rate.?limit/.test(compact)
  ) {
    return "quota";
  }
  if (
    /failed_precondition/.test(compact) ||
    /billing|payment|customer.?to.?enable|activate.?billing|enable billing|insufficient.?funds|insufficient_funds/.test(
      compact
    )
  ) {
    return "billing";
  }
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /permission_denied|unauthenticated|api.?key|unauthorized|forbidden/.test(compact)
  ) {
    return "auth";
  }
  if (/safety|blocked|prohibited/.test(compact)) return "safety";
  if (/missing google key|missing .*key/.test(compact)) return "missing_key";
  return "unknown";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    const google = googleErrorFields(text);
    const detail = google.message || stripSecretsFromMessage(text).slice(0, 180);
    throw new Error(
      stripSecretsFromMessage(
        `HTTP ${response.status}${google.status ? ` ${google.status}` : ""} ${detail}`
      )
    );
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function callGoogleStructured(params: {
  model: GatewayModelId;
  prompt: string;
  fetchImpl: FetchLike;
  signal: AbortSignal;
  maxOutputTokens?: number;
}): Promise<{ raw: unknown; promptTokens?: number; completionTokens?: number }> {
  const key = googleApiKey();
  const gatewayKey = aiGatewayApiKey();
  if (!key && !gatewayKey) {
    throw new Error("missing google key");
  }

  if (gatewayKey) {
    return callOpenAiCompatibleStructured({
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      apiKey: gatewayKey,
      model: MODEL_CATALOG[params.model].vercelGatewayId ?? `google/${params.model}`,
      prompt: params.prompt,
      fetchImpl: params.fetchImpl,
      signal: params.signal,
    });
  }

  const officialId = MODEL_CATALOG[params.model].officialId;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${officialId}:generateContent`;
  const response = await params.fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: params.prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: geminiRestSchema(),
        ...(params.maxOutputTokens
          ? { maxOutputTokens: params.maxOutputTokens }
          : {}),
      },
    }),
    signal: params.signal,
  });
  const json = await readJson(response);
  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const first = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined;
  const text = first?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const usage = json.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number }
    | undefined;
  return {
    raw: parseJsonContent(text),
    promptTokens: usage?.promptTokenCount,
    completionTokens: usage?.candidatesTokenCount,
  };
}

async function callOpenAiCompatibleStructured(params: {
  url: string;
  apiKey: string;
  model: string;
  prompt: string;
  fetchImpl: FetchLike;
  signal: AbortSignal;
}): Promise<{ raw: unknown; promptTokens?: number; completionTokens?: number }> {
  const response = await params.fetchImpl(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Return JSON matching the study lens schema. Diagrams must use nodes and edges, never image generation.",
        },
        { role: "user", content: params.prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "study_lens",
          schema: LENS_JSON_SCHEMA,
          strict: false,
        },
      },
    }),
    signal: params.signal,
  });
  const json = await readJson(response);
  const choices = Array.isArray(json.choices) ? json.choices : [];
  const message = choices[0] as { message?: { content?: string } } | undefined;
  const usage = json.usage as
    | { prompt_tokens?: number; completion_tokens?: number }
    | undefined;
  return {
    raw: parseJsonContent(message?.message?.content ?? ""),
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
  };
}

async function callOpenAiStructured(params: {
  model: GatewayModelId;
  prompt: string;
  fetchImpl: FetchLike;
  signal: AbortSignal;
}) {
  const gatewayKey = aiGatewayApiKey();
  const key = openaiApiKey() || gatewayKey;
  if (!key) throw new Error("missing openai key");
  const useGateway = Boolean(gatewayKey) && !openaiApiKey();
  return callOpenAiCompatibleStructured({
    url: useGateway
      ? "https://ai-gateway.vercel.sh/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions",
    apiKey: key,
    model: useGateway
      ? MODEL_CATALOG[params.model].vercelGatewayId ?? `openai/${params.model}`
      : MODEL_CATALOG[params.model].officialId,
    prompt: params.prompt,
    fetchImpl: params.fetchImpl,
    signal: params.signal,
  });
}

async function callMistralStructured(params: {
  model: GatewayModelId;
  prompt: string;
  fetchImpl: FetchLike;
  signal: AbortSignal;
}) {
  const gatewayKey = aiGatewayApiKey();
  const key = mistralApiKey() || gatewayKey;
  if (!key) throw new Error("missing mistral key");
  const useGateway = Boolean(gatewayKey) && !mistralApiKey();
  return callOpenAiCompatibleStructured({
    url: useGateway
      ? "https://ai-gateway.vercel.sh/v1/chat/completions"
      : "https://api.mistral.ai/v1/chat/completions",
    apiKey: key,
    model: useGateway
      ? MODEL_CATALOG[params.model].vercelGatewayId ?? "mistral/ministral-3b"
      : MODEL_CATALOG[params.model].officialId,
    prompt: params.prompt,
    fetchImpl: params.fetchImpl,
    signal: params.signal,
  });
}

export async function callProviderStructuredLens(params: {
  provider: PaidAiProvider;
  model: GatewayModelId;
  prompt: string;
  fallback: AiLensResponsePayload;
  fetchImpl?: FetchLike;
  maxAttempts?: number;
  maxOutputTokens?: number;
}): Promise<ProviderCallResult> {
  const fetchImpl = params.fetchImpl ?? (fetch as FetchLike);
  let lastClass: ProviderErrorClass = "unknown";
  let lastDetail: SanitizedProviderError | null = null;
  const maxAttempts = Math.max(1, params.maxAttempts ?? PROVIDER_MAX_ATTEMPTS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const modeled = await withTimeout(PROVIDER_CALL_TIMEOUT_MS, (signal) => {
        if (params.provider === "google") {
          return callGoogleStructured({
            model: params.model,
            prompt: params.prompt,
            fetchImpl,
            signal,
            maxOutputTokens: params.maxOutputTokens,
          });
        }
        if (params.provider === "openai") {
          return callOpenAiStructured({
            model: params.model,
            prompt: params.prompt,
            fetchImpl,
            signal,
          });
        }
        return callMistralStructured({
          model: params.model,
          prompt: params.prompt,
          fetchImpl,
          signal,
        });
      });
      const merged = mergeStructuredLensPayload(params.fallback, modeled.raw);
      if (!merged.usable) {
        lastClass = "unusable_output";
        continue;
      }
      return {
        payload: merged.payload,
        promptTokens: modeled.promptTokens,
        completionTokens: modeled.completionTokens,
        errorClass: null,
        errorDetail: null,
        provider: params.provider,
        model: params.model,
      };
    } catch (error) {
      lastDetail = sanitizeProviderError(error);
      lastClass = lastDetail.errorClass;
      console.warn(
        JSON.stringify({
          event: "oryzen.ai.provider_error",
          provider: params.provider,
          model: params.model,
          attempt,
          httpStatus: lastDetail.httpStatus,
          googleStatus: lastDetail.googleStatus,
          errorClass: lastDetail.errorClass,
          message: lastDetail.message,
        })
      );
      if (
        lastClass === "billing" ||
        lastClass === "quota" ||
        lastClass === "auth" ||
        lastClass === "safety" ||
        lastClass === "missing_key"
      ) {
        break;
      }
    }
  }

  return {
    payload: params.fallback,
    errorClass: lastClass,
    errorDetail: lastDetail,
    provider: "deterministic",
    model: "deterministic",
  };
}

export async function generateStudyText(params: {
  prompt: string;
  fetchImpl?: FetchLike;
  userId?: string;
  supabase?: SupabaseClient | null;
  walletCapInr?: number;
  billingMonth?: string;
  spendClass?: SpendClass;
}): Promise<{
  text: string;
  provider: PaidAiProvider;
  model: GatewayModelId;
  promptTokens: number;
  completionTokens: number;
  costInr: number;
  budgetBlocked: boolean;
} | null> {
  const userId = params.userId ?? "local-student-scholar";
  const billingMonth = params.billingMonth ?? new Date().toISOString().slice(0, 7);
  const spendClass = params.spendClass ?? "standard";
  const attempts = planStudyProviderAttempts("gemini-3.5-flash-lite");
  if (attempts.length === 0) return null;

  const promptTokensEst =
    spendClass === "vault_generate" ? 8000 : spendClass === "deep_synthesis" ? 4000 : 2000;
  const completionTokensEst =
    spendClass === "vault_generate" ? 2000 : spendClass === "deep_synthesis" ? 1200 : 400;
  const spentInr = await getCurrentMonthlyWalletSpendInr(
    params.supabase,
    userId,
    billingMonth
  );
  const remainingWallet =
    (params.walletCapInr ?? SHIELD_4_DEFAULT_WALLET_CAP_INR) - spentInr;
  const estimateInr = reservationEstimateForAttempts(
    attempts.map((item) => item.model),
    promptTokensEst,
    completionTokensEst,
    remainingWallet
  );
  const decision = reserveMonthlyAiBudget({
    userId,
    billingMonth,
    spentInr,
    estimateInr,
    capInr: params.walletCapInr,
    spendClass,
  });

  if (!decision.allowed || !decision.reservation) {
    recordAiUsageObservation(userId, {
      billingMonth,
      provider: "deterministic",
      model: "deterministic",
      promptTokens: 0,
      completionTokens: 0,
      costInr: 0,
      success: false,
      fallback: true,
      cacheHit: false,
      budgetBlocked: true,
    });
    await recordWalletUsageLog(params.supabase, {
      userId,
      billingMonth,
      lensType: spendClass,
      modelUsed: "deterministic",
      promptTokens: 0,
      completionTokens: 0,
      costInr: 0,
      cacheHit: false,
      downgradedToFlashLite: false,
    });
    return {
      text: "",
      provider: attempts[0]!.provider,
      model: "deterministic",
      promptTokens: 0,
      completionTokens: 0,
      costInr: 0,
      budgetBlocked: true,
    };
  }

  const fetchImpl = params.fetchImpl ?? (fetch as FetchLike);
  try {
    for (const attempt of attempts) {
      const nextEstimate = calculateCallCostInr(
        attempt.model,
        promptTokensEst,
        completionTokensEst
      );
      if (!canConsumeReservation(decision.reservation, nextEstimate)) {
        continue;
      }
      const result = await callProviderStructuredLens({
        provider: attempt.provider,
        model: attempt.model,
        prompt: `${params.prompt}\n\nReturn JSON with title, markdown_body, and key_points only.`,
        fallback: {
          lens_type: "explain",
          prakriti_dosha: "Vata",
          title: "Study notes",
          markdown_body: "",
          key_points: [],
          citations: [],
          used_fallback: true,
        },
        fetchImpl,
      });
      const promptTokens = result.promptTokens ?? promptTokensEst;
      const completionTokens = result.completionTokens ?? completionTokensEst;
      const costInr =
        result.errorClass === null
          ? calculateCallCostInr(attempt.model, promptTokens, completionTokens)
          : calculateCallCostInr(
              attempt.model,
              result.promptTokens ?? 0,
              result.completionTokens ?? 0
            );
      consumeReservation(decision.reservation, costInr);
      if (result.errorClass === null && result.payload.markdown_body.trim()) {
        await recordWalletUsageLog(params.supabase, {
          userId,
          billingMonth,
          lensType: spendClass,
          modelUsed: attempt.model,
          promptTokens,
          completionTokens,
          costInr,
          cacheHit: false,
          downgradedToFlashLite: false,
        });
        recordAiUsageObservation(userId, {
          billingMonth,
          provider: attempt.provider,
          model: attempt.model,
          promptTokens,
          completionTokens,
          costInr,
          success: true,
          fallback: attempt !== attempts[0],
          cacheHit: false,
          budgetBlocked: false,
        });
        settleMonthlyAiReservation(decision.reservation, 0);
        return {
          text: result.payload.markdown_body,
          provider: attempt.provider,
          model: attempt.model,
          promptTokens,
          completionTokens,
          costInr,
          budgetBlocked: false,
        };
      }
    }
  } finally {
    releaseMonthlyAiReservation(decision.reservation);
  }

  recordAiUsageObservation(userId, {
    billingMonth,
    provider: "deterministic",
    model: "deterministic",
    promptTokens: 0,
    completionTokens: 0,
    costInr: 0,
    success: false,
    fallback: true,
    cacheHit: false,
    budgetBlocked: false,
  });
  return null;
}
