import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allowanceMessage,
  allowancePlanFor,
  allowanceStatus,
  canSpendHelp,
  helpsUsedToday,
  MONTHLY_AI_CAP_INR,
  MONTHLY_CAP_MESSAGE,
  type AllowanceStatus,
} from "@/lib/ai/daily-allowance";
import {
  calculateCallCostInr,
  getCurrentMonthlyWalletSpendInr,
  recordWalletUsageLog,
  releaseMonthlyAiReservation,
  reserveMonthlyAiBudget,
} from "@/lib/ai/spend-guard";
import {
  AI_NOTES_LENS,
  AI_NOTES_MODEL,
  AI_NOTES_TIMEOUT_MS,
  aiNotesFailureMessage,
  parsePhotoNotes,
  parseShortNotes,
  photoNotesRequestBody,
  shortNotesRequestBody,
  worstCaseAiNotesCostInr,
  type AiNotesKind,
  type PhotoNotes,
  type ShortNotes,
} from "./ai-notes";

export type AiNotesInput =
  | { kind: "photo"; image: { data: string; mimeType: string } }
  | { kind: "short"; chapterTitle: string; text: string };

export type AiNotesOutcome =
  | { ok: true; status: 200; kind: "photo"; photo: PhotoNotes; allowance: AllowanceStatus }
  | { ok: true; status: 200; kind: "short"; short: ShortNotes; allowance: AllowanceStatus }
  | { ok: false; status: number; code: string; error: string; allowance?: AllowanceStatus; reference?: string };

/**
 * Helps being made right now, per student, on this server. Rows are written only when the AI
 * answers, so without this many requests at once would all see the same "helps used".
 */
const inFlightHelps = new Map<string, number>();

function changeInFlight(userId: string, delta: number): void {
  const next = (inFlightHelps.get(userId) ?? 0) + delta;
  if (next > 0) inFlightHelps.set(userId, next);
  else inFlightHelps.delete(userId);
}

/** Same month key the AI gateway uses for the monthly safety net. */
export function billingMonthFor(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** Photo to notes and Short notes: checks the student's limits, asks Gemini, records the cost. */
export async function makeAiNotes(params: {
  supabase: SupabaseClient;
  userId: string;
  accessStatus: string | null | undefined;
  apiKey: string;
  input: AiNotesInput;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<AiNotesOutcome> {
  const { supabase, userId, input } = params;
  const kind: AiNotesKind = input.kind;
  const lensType = AI_NOTES_LENS[kind];
  const now = params.now ?? new Date();
  const fetchImpl = params.fetchImpl ?? fetch;
  const plan = allowancePlanFor(params.accessStatus);

  const helps = lensType === "short_notes" ? 2 : 1;
  const before = allowanceStatus(plan, await helpsUsedToday(supabase, userId, now));
  const withPending = allowanceStatus(plan, before.used + (inFlightHelps.get(userId) ?? 0));
  if (!canSpendHelp(withPending, lensType)) {
    return { ok: false, status: 429, code: "daily_allowance", error: allowanceMessage(before), allowance: before };
  }
  if (!params.apiKey) {
    return { ok: false, status: 503, code: "not_configured", error: "This isn't switched on yet." };
  }
  const billingMonth = billingMonthFor(now);
  const spent = await getCurrentMonthlyWalletSpendInr(supabase, userId, billingMonth);
  // Holds the most this request can cost, so requests at the same time can't pass the cap together.
  const budget = reserveMonthlyAiBudget({
    userId,
    billingMonth,
    spentInr: spent,
    estimateInr: worstCaseAiNotesCostInr(kind),
    capInr: MONTHLY_AI_CAP_INR[plan],
  });
  if (!budget.allowed) {
    return { ok: false, status: 429, code: "monthly_cap", error: MONTHLY_CAP_MESSAGE, allowance: before };
  }
  changeInFlight(userId, helps);
  try {
    return await callForNotes({ ...params, kind, lensType, plan, before, billingMonth, helps, fetchImpl });
  } finally {
    changeInFlight(userId, -helps);
    if (budget.reservation) releaseMonthlyAiReservation(budget.reservation);
  }
}

async function callForNotes(params: {
  supabase: SupabaseClient;
  userId: string;
  apiKey: string;
  input: AiNotesInput;
  kind: AiNotesKind;
  lensType: string;
  plan: ReturnType<typeof allowancePlanFor>;
  before: AllowanceStatus;
  billingMonth: string;
  helps: number;
  fetchImpl: typeof fetch;
}): Promise<AiNotesOutcome> {
  const { supabase, userId, input, kind, lensType, plan, before, billingMonth, helps, fetchImpl } = params;

  const record = (costInr: number, promptTokens: number, completionTokens: number) =>
    recordWalletUsageLog(supabase, {
      userId,
      billingMonth,
      lensType,
      modelUsed: AI_NOTES_MODEL,
      promptTokens,
      completionTokens,
      costInr,
      cacheHit: false,
      downgradedToFlashLite: false,
    });
  const after = (): AllowanceStatus => allowanceStatus(plan, before.used + helps);

  const body = input.kind === "photo" ? photoNotesRequestBody(input.image) : shortNotesRequestBody(input.chapterTitle, input.text);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_NOTES_TIMEOUT_MS[kind]);
  let response: Response;
  try {
    response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${AI_NOTES_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": params.apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    // Google may still finish (and bill) the call after we stop waiting, so it counts.
    await record(worstCaseAiNotesCostInr(kind), 0, 0);
    return {
      ok: false,
      status: 504,
      code: "timeout",
      error: "This took too long, so it used one AI help. Please try again.",
      allowance: after(),
    };
  }
  clearTimeout(timer);

  const json = (await response.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    error?: { message?: string; status?: string };
  };
  if (!response.ok) {
    console.warn(
      JSON.stringify({
        event: "ai_notes_provider_error",
        kind,
        status: response.status,
        reason: json.error?.status ?? null,
        message: (json.error?.message ?? "").slice(0, 300),
      })
    );
    return {
      ok: false,
      status: response.status === 429 ? 429 : 502,
      code: "provider_error",
      error: aiNotesFailureMessage(response.status),
      reference: `G${response.status}${json.error?.status ? `-${json.error.status}` : ""}`,
      allowance: before,
    };
  }

  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const promptTokens = Math.max(0, json.usageMetadata?.promptTokenCount ?? 0);
  const completionTokens = Math.max(
    0,
    (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0)
  );
  // Google billed this call, so it is always recorded (a small floor so it counts as a help).
  const costInr = Math.max(0.0001, calculateCallCostInr(AI_NOTES_MODEL, promptTokens, completionTokens));
  await record(costInr, promptTokens, completionTokens);

  if (input.kind === "photo") {
    const photo = parsePhotoNotes(raw);
    if (!photo.readable) {
      return {
        ok: false,
        status: 422,
        code: "unreadable",
        error: "This photo couldn't be read as a study page. Try again in good light, holding the phone straight over the page. This used one AI help.",
        allowance: after(),
      };
    }
    return { ok: true, status: 200, kind: "photo", photo, allowance: after() };
  }
  const short = parseShortNotes(raw);
  if (!short) {
    return {
      ok: false,
      status: 422,
      code: candidate?.finishReason === "MAX_TOKENS" ? "cut_short" : "no_notes",
      error: "Short notes couldn't be made from this chapter's text. This used two AI helps.",
      allowance: after(),
    };
  }
  return { ok: true, status: 200, kind: "short", short, allowance: after() };
}
