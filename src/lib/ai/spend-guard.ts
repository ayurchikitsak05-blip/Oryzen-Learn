/**
 * Shield 4 monthly AI spend guard.
 *
 * Product constant: SHIELD_4_DEFAULT_WALLET_CAP_INR = ₹70.00 / month.
 * This is the existing internal wallet ceiling on the ₹199 Pro plan
 * (docs/02_DATA_AND_AI_GOVERNANCE.md). Do not invent a new ₹ SKU.
 *
 * Reserve BEFORE any paid provider fetch. Concurrent requests share the
 * in-memory reservation ledger so two in-flight calls cannot both slip
 * under the cap. Retries and fallbacks draw from the same reservation
 * and must not exceed it. Over-cap requests get a deterministic fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listPriceUsd,
  usdToInrEstimate,
  type AiProvider,
  type GatewayModelId,
} from "./models";

export const SHIELD_4_DEFAULT_WALLET_CAP_INR = 70.0;
export const SHIELD_4_SOFT_DOWNGRADE_RATIO = 0.85;
export const SHIELD_4_WARN_RATIO = 0.8;
export const SHIELD_4_DEEP_SYNTHESIS_REMAINING_RATIO = 0.15;

export const VAULT_GENERATE_INPUT_TOKENS = 8000;
export const VAULT_GENERATE_OUTPUT_TOKENS = 2000;

export type SpendClass = "standard" | "vault_chat" | "vault_generate" | "deep_synthesis";

export type MonthlyBudgetBlockReason = "monthly_cap" | "deep_synthesis_limit";

/**
 * Per-1,000-token internal INR cost rates for Shield 4 wallet accounting.
 * Used for reservation estimates and the post-call ledger.
 */
export const MODEL_COST_PER_1K_TOKENS_INR: Record<
  GatewayModelId,
  { inputInr: number; outputInr: number }
> = {
  "gemini-2.5-pro": { inputInr: 0.14, outputInr: 0.42 },
  "gemini-2.5-flash": { inputInr: 0.018, outputInr: 0.054 },
  "gemini-2.5-flash-lite": { inputInr: 0.006, outputInr: 0.018 },
  "gemini-3.5-flash-lite": { inputInr: 0.0283, outputInr: 0.2362 },
  "gpt-6-luna": { inputInr: 0.0094, outputInr: 0.0472 },
  "ministral-3b-2512": { inputInr: 0.0094, outputInr: 0.0094 },
  deterministic: { inputInr: 0, outputInr: 0 },
};

export function reservationEstimateForAttempts(
  models: GatewayModelId[],
  promptTokens: number,
  completionTokens: number,
  remainingWalletInr: number
): number {
  const estimates = models.map((model) =>
    calculateCallCostInr(model, promptTokens, completionTokens)
  );
  const affordable = estimates.filter((value) => value <= remainingWalletInr + 1e-9);
  if (affordable.length === 0) return estimates[0] ?? 0;
  return Number(Math.max(...affordable).toFixed(4));
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

export interface MonthlyBudgetReservation {
  id: string;
  userId: string;
  billingMonth: string;
  amountInr: number;
  remainingInr: number;
  capInr: number;
  spentInr: number;
}

export interface MonthlyBudgetDecision {
  allowed: boolean;
  reason: MonthlyBudgetBlockReason | null;
  reservation: MonthlyBudgetReservation | null;
  reservedPlusSpentInr: number;
  remainingInr: number;
  warned80: boolean;
}

/** Structured usage row. Never includes passage, prompt, or textbook body. */
export interface AiUsageObservation {
  billingMonth: string;
  provider: AiProvider | string;
  model: GatewayModelId | string;
  promptTokens: number;
  completionTokens: number;
  costInr: number;
  success: boolean;
  fallback: boolean;
  cacheHit: boolean;
  budgetBlocked: boolean;
}

interface ReservationRecord extends MonthlyBudgetReservation {
  createdAt: number;
}

const reservations = new Map<string, ReservationRecord>();
const reservationsByLedger = new Map<string, Set<string>>();
const observationsByUser = new Map<string, AiUsageObservation[]>();
const localMemoryUsageLedger = new Map<string, number>();
let reservationSeq = 0;
const warned80Ledgers = new Set<string>();

function ledgerKey(userId: string, billingMonth: string): string {
  return `${userId.trim().toLowerCase()}|${billingMonth}`;
}

export function setLocalWalletSpendForUser(
  userId: string,
  billingMonth: string,
  amountInr: number
): void {
  localMemoryUsageLedger.set(ledgerKey(userId, billingMonth), amountInr);
}

export async function getCurrentMonthlyWalletSpendInr(
  supabase: SupabaseClient | null | undefined,
  userId: string,
  billingMonth: string
): Promise<number> {
  const key = ledgerKey(userId, billingMonth);
  let spend = localMemoryUsageLedger.get(key) ?? 0;

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

export async function recordWalletUsageLog(
  supabase: SupabaseClient | null | undefined,
  entry: {
    userId: string;
    billingMonth: string;
    lensType: string;
    modelUsed: GatewayModelId | string;
    promptTokens: number;
    completionTokens: number;
    costInr: number;
    cacheHit: boolean;
    downgradedToFlashLite: boolean;
  }
): Promise<number> {
  const key = ledgerKey(entry.userId, entry.billingMonth);
  const current = localMemoryUsageLedger.get(key) ?? 0;
  const updated = Number((current + entry.costInr).toFixed(4));
  localMemoryUsageLedger.set(key, updated);

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

export function reservedAmountInr(userId: string, billingMonth: string): number {
  const ids = reservationsByLedger.get(ledgerKey(userId, billingMonth));
  if (!ids) return 0;
  let sum = 0;
  for (const id of ids) {
    const row = reservations.get(id);
    if (row) sum += row.remainingInr;
  }
  return Number(sum.toFixed(4));
}

export function emitWallet80PercentWarning(params: {
  billingMonth: string;
  capInr: number;
  reservedPlusSpentInr: number;
}): void {
  const ratio = params.capInr > 0 ? params.reservedPlusSpentInr / params.capInr : 0;
  console.warn(
    JSON.stringify({
      event: "oryzen.ai.wallet.80pct",
      billingMonth: params.billingMonth,
      capInr: params.capInr,
      reservedPlusSpentInr: Number(params.reservedPlusSpentInr.toFixed(4)),
      ratio: Number(ratio.toFixed(4)),
    })
  );
}

/**
 * Synchronously reserve estimateInr against spent + already-reserved.
 * Node's single-threaded event loop makes this check-and-set atomic
 * across concurrent awaits that resume on this isolate.
 */
export function reserveMonthlyAiBudget(params: {
  userId: string;
  billingMonth: string;
  spentInr: number;
  estimateInr: number;
  capInr?: number;
  spendClass?: SpendClass;
}): MonthlyBudgetDecision {
  const capInr = params.capInr ?? SHIELD_4_DEFAULT_WALLET_CAP_INR;
  const estimateInr = Math.max(0, Number(params.estimateInr.toFixed(4)));
  const spentInr = Math.max(0, Number(params.spentInr.toFixed(4)));
  const alreadyReserved = reservedAmountInr(params.userId, params.billingMonth);
  const reservedPlusSpentInr = Number(
    (spentInr + alreadyReserved + estimateInr).toFixed(4)
  );
  const remainingInr = Number((capInr - spentInr - alreadyReserved).toFixed(4));
  const ratio = capInr > 0 ? (spentInr + alreadyReserved + estimateInr) / capInr : 1;
  const warnKey = ledgerKey(params.userId, params.billingMonth);
  let warned80 = false;

  if (
    ratio >= SHIELD_4_WARN_RATIO &&
    spentInr + alreadyReserved < capInr &&
    !warned80Ledgers.has(warnKey)
  ) {
    warned80Ledgers.add(warnKey);
    warned80 = true;
    emitWallet80PercentWarning({
      billingMonth: params.billingMonth,
      capInr,
      reservedPlusSpentInr: Number((spentInr + alreadyReserved + estimateInr).toFixed(4)),
    });
  }

  if (params.spendClass === "deep_synthesis" || params.spendClass === "vault_generate") {
    const minRemaining = capInr * SHIELD_4_DEEP_SYNTHESIS_REMAINING_RATIO;
    if (remainingInr < minRemaining || remainingInr < estimateInr) {
      return {
        allowed: false,
        reason: "deep_synthesis_limit",
        reservation: null,
        reservedPlusSpentInr: Number((spentInr + alreadyReserved).toFixed(4)),
        remainingInr,
        warned80,
      };
    }
  }

  if (estimateInr > 0 && reservedPlusSpentInr > capInr) {
    return {
      allowed: false,
      reason: "monthly_cap",
      reservation: null,
      reservedPlusSpentInr: Number((spentInr + alreadyReserved).toFixed(4)),
      remainingInr,
      warned80,
    };
  }

  reservationSeq += 1;
  const id = `res-${reservationSeq}`;
  const record: ReservationRecord = {
    id,
    userId: params.userId,
    billingMonth: params.billingMonth,
    amountInr: estimateInr,
    remainingInr: estimateInr,
    capInr,
    spentInr,
    createdAt: Date.now(),
  };
  reservations.set(id, record);
  const set = reservationsByLedger.get(warnKey) ?? new Set<string>();
  set.add(id);
  reservationsByLedger.set(warnKey, set);

  return {
    allowed: true,
    reason: null,
    reservation: {
      id: record.id,
      userId: record.userId,
      billingMonth: record.billingMonth,
      amountInr: record.amountInr,
      remainingInr: record.remainingInr,
      capInr: record.capInr,
      spentInr: record.spentInr,
    },
    reservedPlusSpentInr,
    remainingInr: Number((remainingInr - estimateInr).toFixed(4)),
    warned80,
  };
}

export function canConsumeReservation(
  reservation: MonthlyBudgetReservation | null,
  nextEstimateInr: number
): boolean {
  if (!reservation) return false;
  const live = reservations.get(reservation.id);
  if (!live) return false;
  return nextEstimateInr <= live.remainingInr + 1e-9;
}

export function consumeReservation(
  reservation: MonthlyBudgetReservation | null,
  actualCostInr: number
): number {
  if (!reservation) return 0;
  const live = reservations.get(reservation.id);
  if (!live) return 0;
  const consumed = Math.max(0, Number(actualCostInr.toFixed(4)));
  live.remainingInr = Number(Math.max(0, live.remainingInr - consumed).toFixed(4));
  reservation.remainingInr = live.remainingInr;
  return live.remainingInr;
}

export function settleMonthlyAiReservation(
  reservation: MonthlyBudgetReservation | null,
  actualCostInr = 0
): void {
  if (!reservation) return;
  consumeReservation(reservation, actualCostInr);
  releaseMonthlyAiReservation(reservation);
}

export function releaseMonthlyAiReservation(
  reservation: MonthlyBudgetReservation | null
): void {
  if (!reservation) return;
  reservations.delete(reservation.id);
  const key = ledgerKey(reservation.userId, reservation.billingMonth);
  const set = reservationsByLedger.get(key);
  if (!set) return;
  set.delete(reservation.id);
  if (set.size === 0) reservationsByLedger.delete(key);
}

export function recordAiUsageObservation(
  userId: string,
  observation: AiUsageObservation
): void {
  const key = userId.trim().toLowerCase();
  const list = observationsByUser.get(key) ?? [];
  list.push(observation);
  observationsByUser.set(key, list);
}

export function listOwnAiUsageObservations(userId: string): AiUsageObservation[] {
  return [...(observationsByUser.get(userId.trim().toLowerCase()) ?? [])];
}

export async function getOwnMonthlyAiUsage(params: {
  userId: string;
  billingMonth?: string;
  supabase?: SupabaseClient | null;
}): Promise<{
  billingMonth: string;
  walletCapInr: number;
  spentInr: number;
  reservedInr: number;
  remainingInr: number;
  callCount: number;
  paidCallCount: number;
  cacheHits: number;
  fallbackCount: number;
  budgetBlockedCount: number;
  promptTokens: number;
  completionTokens: number;
  observations: AiUsageObservation[];
}> {
  const billingMonth = params.billingMonth ?? new Date().toISOString().slice(0, 7);
  const summary = summarizeOwnMonthlyAiUsage(params.userId, billingMonth);
  const spentInr = await getCurrentMonthlyWalletSpendInr(
    params.supabase,
    params.userId,
    billingMonth
  );
  const reservedInr = reservedAmountInr(params.userId, billingMonth);
  return {
    billingMonth,
    walletCapInr: SHIELD_4_DEFAULT_WALLET_CAP_INR,
    spentInr,
    reservedInr,
    remainingInr: Number(
      Math.max(0, SHIELD_4_DEFAULT_WALLET_CAP_INR - spentInr - reservedInr).toFixed(4)
    ),
    callCount: summary.callCount,
    paidCallCount: summary.paidCallCount,
    cacheHits: summary.cacheHits,
    fallbackCount: summary.fallbackCount,
    budgetBlockedCount: summary.budgetBlockedCount,
    promptTokens: summary.promptTokens,
    completionTokens: summary.completionTokens,
    observations: summary.observations,
  };
}

export function summarizeOwnMonthlyAiUsage(
  userId: string,
  billingMonth: string
): {
  billingMonth: string;
  callCount: number;
  paidCallCount: number;
  cacheHits: number;
  fallbackCount: number;
  budgetBlockedCount: number;
  promptTokens: number;
  completionTokens: number;
  costInr: number;
  observations: AiUsageObservation[];
} {
  const observations = listOwnAiUsageObservations(userId).filter(
    (row) => row.billingMonth === billingMonth
  );
  return {
    billingMonth,
    callCount: observations.length,
    paidCallCount: observations.filter((row) => row.success && !row.cacheHit && row.costInr > 0)
      .length,
    cacheHits: observations.filter((row) => row.cacheHit).length,
    fallbackCount: observations.filter((row) => row.fallback).length,
    budgetBlockedCount: observations.filter((row) => row.budgetBlocked).length,
    promptTokens: observations.reduce((sum, row) => sum + row.promptTokens, 0),
    completionTokens: observations.reduce((sum, row) => sum + row.completionTokens, 0),
    costInr: Number(
      observations.reduce((sum, row) => sum + row.costInr, 0).toFixed(4)
    ),
    observations,
  };
}

export function clearLocalAiSpendState(): void {
  reservations.clear();
  reservationsByLedger.clear();
  observationsByUser.clear();
  localMemoryUsageLedger.clear();
  warned80Ledgers.clear();
  reservationSeq = 0;
}
