/**
 * Provider-independent model catalog for the ORYZEN Learn study gateway.
 *
 * Prices and IDs were verified against official pages on 21 Oct 2026.
 * Do not invent model IDs. Server-only env names live here as documentation —
 * never prefix them with NEXT_PUBLIC_ and never hardcode keys.
 */

import type { HighlightLensType } from "@/lib/prakriti/config";

export type CatalogTaskType = HighlightLensType | "deep_integrative_synthesis";

export type PaidAiProvider = "openai" | "google" | "mistral";
export type AiProvider = PaidAiProvider | "deterministic";

export type GatewayModelId =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash-lite"
  | "gpt-6-luna"
  | "ministral-3b-2512"
  | "deterministic";

export const PRICING_AS_OF = "2026-10-21";

/** Market close ~₹94.47/$ (Business Standard / News On AIR, 21 Oct 2026). Estimate. */
export const USD_INR_RATE_ESTIMATE = 94.47;

export const SERVER_AI_ENV_NAMES = [
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "MISTRAL_API_KEY",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
] as const;

export interface OfficialModelRecord {
  id: GatewayModelId;
  provider: AiProvider;
  officialId: string;
  vercelGatewayId: string | null;
  displayName: string;
  availability: "available" | "unavailable" | "name-unverified";
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  structuredOutput: boolean;
  structuredOutputNotes: string;
  sources: string[];
}

export const MODEL_CATALOG: Record<GatewayModelId, OfficialModelRecord> = {
  "gpt-6-luna": {
    id: "gpt-6-luna",
    provider: "openai",
    officialId: "gpt-6-luna",
    vercelGatewayId: "openai/gpt-6-luna",
    displayName: "GPT-6 Luna",
    availability: "available",
    inputUsdPer1M: 0.1,
    outputUsdPer1M: 0.5,
    structuredOutput: true,
    structuredOutputNotes:
      "OpenAI lists structured_outputs. Vercel AI Gateway tags structured-output and response_format.",
    sources: [
      "https://developers.openai.com/api/docs/models/gpt-6-luna",
      "https://openai.com/index/introducing-gpt-6-sol-and-luna/",
      "https://ai-gateway.vercel.sh/v1/models",
    ],
  },
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite",
    provider: "google",
    officialId: "gemini-2.5-flash-lite",
    vercelGatewayId: "google/gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite",
    availability: "available",
    inputUsdPer1M: 0.1,
    outputUsdPer1M: 0.4,
    structuredOutput: true,
    structuredOutputNotes:
      "Google lists Structured outputs. Vercel AI Gateway tags structured-output. Access may be limited to prior 2.5 users; Google now recommends newer Flash-Lite SKUs for new projects.",
    sources: [
      "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://ai-gateway.vercel.sh/v1/models",
    ],
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    provider: "google",
    officialId: "gemini-2.5-flash",
    vercelGatewayId: "google/gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    availability: "available",
    inputUsdPer1M: 0.3,
    outputUsdPer1M: 2.5,
    structuredOutput: true,
    structuredOutputNotes: "Google Gemini Developer API structured outputs.",
    sources: [
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://ai-gateway.vercel.sh/v1/models",
    ],
  },
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    provider: "google",
    officialId: "gemini-2.5-pro",
    vercelGatewayId: "google/gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    availability: "available",
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    structuredOutput: true,
    structuredOutputNotes: "Google Gemini Developer API structured outputs.",
    sources: [
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://ai-gateway.vercel.sh/v1/models",
    ],
  },
  "ministral-3b-2512": {
    id: "ministral-3b-2512",
    provider: "mistral",
    officialId: "ministral-3b-2512",
    vercelGatewayId: "mistral/ministral-3b",
    displayName: "Ministral 3 3B",
    availability: "available",
    inputUsdPer1M: 0.1,
    outputUsdPer1M: 0.1,
    structuredOutput: true,
    structuredOutputNotes:
      "Mistral docs list structured-outputs for ministral-3b-2512 / ministral-3b-latest. Vercel AI Gateway id mistral/ministral-3b does not currently advertise a structured-output tag.",
    sources: [
      "https://docs.mistral.ai/models/ministral-3-3b-25-12.md",
      "https://docs.mistral.ai/inference/pricing",
      "https://ai-gateway.vercel.sh/v1/models",
    ],
  },
  deterministic: {
    id: "deterministic",
    provider: "deterministic",
    officialId: "deterministic",
    vercelGatewayId: null,
    displayName: "Local source-grounded compose",
    availability: "available",
    inputUsdPer1M: 0,
    outputUsdPer1M: 0,
    structuredOutput: true,
    structuredOutputNotes: "Local schema builders and SVG diagram nodes/edges. No API.",
    sources: [],
  },
};

export const PROVIDER_DEFAULT_MODEL: Record<PaidAiProvider, GatewayModelId> = {
  google: "gemini-2.5-flash-lite",
  mistral: "ministral-3b-2512",
  openai: "gpt-6-luna",
};

/**
 * Cheapest typical-call order (2k in + 400 out @ official list prices).
 * Preferred provider is tried first; this list is the fallback order.
 */
export const CHEAPEST_PROVIDER_ORDER: PaidAiProvider[] = [
  "mistral",
  "google",
  "openai",
];

/**
 * Task → preferred model. Config only — student UI keeps calling lens ids.
 * Standard highlight lenses stay on Flash; deep synthesis stays on Pro;
 * wallet-cap routing still downgrades to Flash-Lite.
 */
export const TASK_PREFERRED_MODELS: Record<CatalogTaskType, GatewayModelId> = {
  ayurvedic: "gemini-2.5-flash",
  illustrative: "gemini-2.5-flash",
  high_yield_revision: "gemini-2.5-flash",
  save_passage: "gemini-2.5-flash",
  test_me: "gemini-2.5-flash",
  explain: "gemini-2.5-flash",
  story: "gemini-2.5-flash",
  deep_integrative_synthesis: "gemini-2.5-pro",
};

export const TYPICAL_LENS_INPUT_TOKENS = 2000;
export const TYPICAL_LENS_OUTPUT_TOKENS = 400;
export const LIGHT_LENSES_PER_DAY = 20;
export const MODERATE_LENSES_PER_DAY = 80;
export const HEAVY_LENSES_PER_DAY = 200;
export const DAYS_PER_MONTH = 30;
export const LIGHT_CACHE_HIT_RATE = 0.5;
export const MODERATE_CACHE_HIT_RATE = 0.25;
export const HEAVY_CACHE_HIT_RATE = 0.1;

/** tiktoken-free estimate. Label as estimate wherever surfaced. */
export function estimateTokensFromChars(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function listPriceUsd(
  model: GatewayModelId,
  promptTokens: number,
  completionTokens: number
): number {
  const row = MODEL_CATALOG[model];
  return (
    (promptTokens / 1_000_000) * row.inputUsdPer1M +
    (completionTokens / 1_000_000) * row.outputUsdPer1M
  );
}

export function usdToInrEstimate(usd: number): number {
  return usd * USD_INR_RATE_ESTIMATE;
}

export interface MonthlyCostProjection {
  students: number;
  intensity: "light" | "moderate" | "heavy";
  lensesPerDay: number;
  cacheHitRate: number;
  billableCalls: number;
  model: GatewayModelId;
  usd: number;
  inr: number;
}

export function projectMonthlyCost(params: {
  students: number;
  intensity: "light" | "moderate" | "heavy";
  model: GatewayModelId;
}): MonthlyCostProjection {
  const lensesPerDay =
    params.intensity === "light"
      ? LIGHT_LENSES_PER_DAY
      : params.intensity === "moderate"
        ? MODERATE_LENSES_PER_DAY
        : HEAVY_LENSES_PER_DAY;
  const cacheHitRate =
    params.intensity === "light"
      ? LIGHT_CACHE_HIT_RATE
      : params.intensity === "moderate"
        ? MODERATE_CACHE_HIT_RATE
        : HEAVY_CACHE_HIT_RATE;
  const billableCalls = Math.round(
    params.students * lensesPerDay * DAYS_PER_MONTH * (1 - cacheHitRate)
  );
  const usd =
    billableCalls *
    listPriceUsd(
      params.model,
      TYPICAL_LENS_INPUT_TOKENS,
      TYPICAL_LENS_OUTPUT_TOKENS
    );
  return {
    students: params.students,
    intensity: params.intensity,
    lensesPerDay,
    cacheHitRate,
    billableCalls,
    model: params.model,
    usd,
    inr: usdToInrEstimate(usd),
  };
}

export function modelForProvider(
  provider: PaidAiProvider,
  preferred: GatewayModelId
): GatewayModelId {
  if (MODEL_CATALOG[preferred].provider === provider) return preferred;
  if (provider === "google" && preferred === "gemini-2.5-pro") {
    return "gemini-2.5-pro";
  }
  return PROVIDER_DEFAULT_MODEL[provider];
}
