import type { AiLensResponsePayload } from "./gateway";
import { mergeStructuredLensPayload } from "./gemini-structured";
import {
  CHEAPEST_PROVIDER_ORDER,
  MODEL_CATALOG,
  modelForProvider,
  type AiProvider,
  type GatewayModelId,
  type PaidAiProvider,
} from "./models";

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

export interface ProviderCallResult {
  payload: AiLensResponsePayload;
  promptTokens?: number;
  completionTokens?: number;
  errorClass: ProviderErrorClass | null;
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

export function classifyProviderError(error: unknown): ProviderErrorClass {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "unknown";
  const compact = text.toLowerCase();
  if (/abort|timeout|timed out/i.test(compact)) return "timeout";
  if (/quota|resource.?exhausted|rate.?limit|429/.test(compact)) return "quota";
  if (
    /billing|payment|customer.?to.?enable|activate.?billing|insufficient.?funds|insufficient_funds/.test(
      compact
    )
  ) {
    return "billing";
  }
  if (/api.?key|permission|unauthorized|forbidden|401|403/.test(compact)) {
    return "auth";
  }
  if (/safety|blocked|prohibited/.test(compact)) return "safety";
  return "unknown";
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
    .replace(/Bearer\s+\S+/gi, "Bearer redacted");
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      stripSecretsFromMessage(`HTTP ${response.status} ${text.slice(0, 240)}`)
    );
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function callGoogleStructured(params: {
  model: GatewayModelId;
  prompt: string;
  fetchImpl: FetchLike;
  signal: AbortSignal;
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
}): Promise<ProviderCallResult> {
  const fetchImpl = params.fetchImpl ?? (fetch as FetchLike);
  let lastClass: ProviderErrorClass = "unknown";

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const modeled = await withTimeout(PROVIDER_CALL_TIMEOUT_MS, (signal) => {
        if (params.provider === "google") {
          return callGoogleStructured({
            model: params.model,
            prompt: params.prompt,
            fetchImpl,
            signal,
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
        provider: params.provider,
        model: params.model,
      };
    } catch (error) {
      lastClass = classifyProviderError(error);
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
    provider: "deterministic",
    model: "deterministic",
  };
}

export async function generateStudyText(params: {
  prompt: string;
  fetchImpl?: FetchLike;
}): Promise<{ text: string; provider: PaidAiProvider; model: GatewayModelId } | null> {
  const attempts = planProviderAttempts("gemini-2.5-flash-lite");
  if (attempts.length === 0) return null;

  const fetchImpl = params.fetchImpl ?? (fetch as FetchLike);
  for (const attempt of attempts) {
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
    if (result.errorClass === null && result.payload.markdown_body.trim()) {
      return {
        text: result.payload.markdown_body,
        provider: attempt.provider,
        model: attempt.model,
      };
    }
  }
  return null;
}
