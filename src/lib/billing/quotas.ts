/**
 * Layer 5: Freemium Quotas, Pro / Exam Pass Tiers & Exam Booster Packs (`src/lib/billing/quotas.ts`)
 *
 * Enforces:
 * - Free Tier (`free`): Max 3 active PDFs, 10 grounded AI explanations/day, 1 AI quiz/day.
 * - Pro / Exam Pass Tier (`pro_monthly` ₹199/mo or `exam_pass_6mo` ₹799/6mo):
 *   25+ active PDFs, 150 AI explanations/day, unlimited quiz generation and spaced repetition.
 * - Exam Booster Top-Up (`₹49/mo` pack): Adds +100 AI explanations + 20 quizzes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionPlanTier = "free" | "pro_monthly" | "exam_pass_6mo";

export type MeteredResourceType =
  | "active_pdf"
  | "ai_explanation"
  | "ai_quiz";

export interface PlanTierEntitlements {
  tier: SubscriptionPlanTier;
  displayName: string;
  priceInr: number;
  billingCycleLabel: string;
  maxActivePdfs: number;
  dailyAiExplanationsLimit: number;
  /** `null` represents UNLIMITED quizzes & spaced repetition on Pro / Exam Pass */
  dailyAiQuizzesLimit: number | null;
  unlimitedSpacedRepetition: boolean;
}

export const PLAN_ENTITLEMENTS: Record<
  SubscriptionPlanTier,
  PlanTierEntitlements
> = {
  free: {
    tier: "free",
    displayName: "Free Student Tier",
    priceInr: 0,
    billingCycleLabel: "₹0 / forever",
    maxActivePdfs: 3,
    dailyAiExplanationsLimit: 10,
    dailyAiQuizzesLimit: 1,
    unlimitedSpacedRepetition: false,
  },
  pro_monthly: {
    tier: "pro_monthly",
    displayName: "Pro Scholar Monthly",
    priceInr: 199,
    billingCycleLabel: "₹199 / month",
    maxActivePdfs: 25,
    dailyAiExplanationsLimit: 150,
    dailyAiQuizzesLimit: null, // Unlimited
    unlimitedSpacedRepetition: true,
  },
  exam_pass_6mo: {
    tier: "exam_pass_6mo",
    displayName: "Exam Pass (6-Month, Any Faculty)",
    priceInr: 799,
    billingCycleLabel: "₹799 / 6 months",
    maxActivePdfs: 50, // 25+ PDFs
    dailyAiExplanationsLimit: 150,
    dailyAiQuizzesLimit: null, // Unlimited
    unlimitedSpacedRepetition: true,
  },
};

export const EXAM_BOOSTER_PACK_SPEC = {
  priceInr: 49,
  label: "Exam Booster Top-Up (₹49/mo Pack)",
  bonusAiExplanations: 100,
  bonusAiQuizzes: 20,
} as const;

export interface UserQuotaLedgerState {
  userId: string;
  planTier: SubscriptionPlanTier;
  usageDate: string; // YYYY-MM-DD
  activePdfCount: number;
  dailyExplanationsUsed: number;
  dailyQuizzesUsed: number;
  boosterPacksPurchased: number;
  boosterExplanationsRemaining: number;
  boosterQuizzesRemaining: number;
  updatedAt: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  resource: MeteredResourceType;
  consumedFromBooster: boolean;
  reason?: string;
  state: UserQuotaLedgerState;
}

const memoryQuotaStore = new Map<string, UserQuotaLedgerState>();

export function clearLocalBillingQuotaStore(): void {
  memoryQuotaStore.clear();
}

export function createInitialUserQuotaState(
  userId: string,
  planTier: SubscriptionPlanTier = "free",
  usageDate: string = new Date().toISOString().slice(0, 10)
): UserQuotaLedgerState {
  return {
    userId,
    planTier,
    usageDate,
    activePdfCount: 0,
    dailyExplanationsUsed: 0,
    dailyQuizzesUsed: 0,
    boosterPacksPurchased: 0,
    boosterExplanationsRemaining: 0,
    boosterQuizzesRemaining: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function getOrInitUserQuotaState(
  userId: string,
  defaultTier: SubscriptionPlanTier = "free",
  todayDate: string = new Date().toISOString().slice(0, 10)
): UserQuotaLedgerState {
  const existing = memoryQuotaStore.get(userId);
  if (!existing) {
    const fresh = createInitialUserQuotaState(userId, defaultTier, todayDate);
    memoryQuotaStore.set(userId, fresh);
    return fresh;
  }

  // Automatically reset daily counters when the calendar date advances
  if (existing.usageDate !== todayDate) {
    const resetState: UserQuotaLedgerState = {
      ...existing,
      usageDate: todayDate,
      dailyExplanationsUsed: 0,
      dailyQuizzesUsed: 0,
      updatedAt: new Date().toISOString(),
    };
    memoryQuotaStore.set(userId, resetState);
    return resetState;
  }

  return existing;
}

/**
 * Purchases and applies an Exam Booster Top-Up Pack (₹49/mo: +100 AI explanations + 20 quizzes).
 */
export async function applyExamBoosterPack(params: {
  userId: string;
  packCount?: number;
  supabase?: SupabaseClient | null;
}): Promise<UserQuotaLedgerState> {
  const count = Math.max(1, Math.floor(params.packCount ?? 1));
  const current = getOrInitUserQuotaState(params.userId);

  const updated: UserQuotaLedgerState = {
    ...current,
    boosterPacksPurchased: current.boosterPacksPurchased + count,
    boosterExplanationsRemaining:
      current.boosterExplanationsRemaining +
      count * EXAM_BOOSTER_PACK_SPEC.bonusAiExplanations,
    boosterQuizzesRemaining:
      current.boosterQuizzesRemaining +
      count * EXAM_BOOSTER_PACK_SPEC.bonusAiQuizzes,
    updatedAt: new Date().toISOString(),
  };

  memoryQuotaStore.set(params.userId, updated);

  if (params.supabase) {
    try {
      await params.supabase.from("user_subscriptions_and_quotas").upsert(
        {
          user_id: updated.userId,
          plan_tier: updated.planTier,
          active_pdf_count: updated.activePdfCount,
          usage_date: updated.usageDate,
          daily_explanations_used: updated.dailyExplanationsUsed,
          daily_quizzes_used: updated.dailyQuizzesUsed,
          booster_packs_purchased: updated.boosterPacksPurchased,
          booster_explanations_remaining: updated.boosterExplanationsRemaining,
          booster_quizzes_remaining: updated.boosterQuizzesRemaining,
          updated_at: updated.updatedAt,
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Local ledger already updated
    }
  }

  return updated;
}

/**
 * Upgrades or changes a student's subscription plan tier (`free`, `pro_monthly`, `exam_pass_6mo`).
 */
export async function upgradeUserPlanTier(params: {
  userId: string;
  newTier: SubscriptionPlanTier;
  supabase?: SupabaseClient | null;
}): Promise<UserQuotaLedgerState> {
  const current = getOrInitUserQuotaState(params.userId);
  const updated: UserQuotaLedgerState = {
    ...current,
    planTier: params.newTier,
    updatedAt: new Date().toISOString(),
  };

  memoryQuotaStore.set(params.userId, updated);

  if (params.supabase) {
    try {
      await params.supabase.from("user_subscriptions_and_quotas").upsert(
        {
          user_id: updated.userId,
          plan_tier: updated.planTier,
          active_pdf_count: updated.activePdfCount,
          usage_date: updated.usageDate,
          daily_explanations_used: updated.dailyExplanationsUsed,
          daily_quizzes_used: updated.dailyQuizzesUsed,
          booster_packs_purchased: updated.boosterPacksPurchased,
          booster_explanations_remaining: updated.boosterExplanationsRemaining,
          booster_quizzes_remaining: updated.boosterQuizzesRemaining,
          updated_at: updated.updatedAt,
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Local ledger already updated
    }
  }

  return updated;
}

/**
 * Evaluates and consumes 1 unit of a metered resource (`active_pdf`, `ai_explanation`, or `ai_quiz`).
 * Automatically draws from Exam Booster Top-Up packs (`+100 explanations`, `+20 quizzes`)
 * whenever a user's daily tier allowance is exhausted.
 */
export async function evaluateAndConsumeQuota(params: {
  userId: string;
  resource: MeteredResourceType;
  todayDate?: string;
  supabase?: SupabaseClient | null;
}): Promise<QuotaCheckResult> {
  const state = getOrInitUserQuotaState(
    params.userId,
    "free",
    params.todayDate
  );
  const entitlements = PLAN_ENTITLEMENTS[state.planTier];

  let allowed = false;
  let consumedFromBooster = false;
  let reason: string | undefined;
  const nextState: UserQuotaLedgerState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  if (params.resource === "active_pdf") {
    if (state.activePdfCount < entitlements.maxActivePdfs) {
      allowed = true;
      nextState.activePdfCount += 1;
    } else {
      allowed = false;
      reason = `${entitlements.displayName} allows max ${entitlements.maxActivePdfs} active PDFs. Upgrade to Pro (₹199/mo) or Exam Pass (₹799/6mo) for 25+ PDFs.`;
    }
  } else if (params.resource === "ai_explanation") {
    if (state.dailyExplanationsUsed < entitlements.dailyAiExplanationsLimit) {
      allowed = true;
      nextState.dailyExplanationsUsed += 1;
    } else if (state.boosterExplanationsRemaining > 0) {
      allowed = true;
      consumedFromBooster = true;
      nextState.boosterExplanationsRemaining -= 1;
    } else {
      allowed = false;
      reason = `Daily AI Explanation limit (${entitlements.dailyAiExplanationsLimit}/day) reached on ${entitlements.displayName}. Add an Exam Booster Pack (₹49 for +100 explanations & +20 quizzes) or upgrade to Pro.`;
    }
  } else if (params.resource === "ai_quiz") {
    if (entitlements.dailyAiQuizzesLimit === null) {
      // Pro & Exam Pass have unlimited quiz generation & spaced repetition
      allowed = true;
      nextState.dailyQuizzesUsed += 1;
    } else if (state.dailyQuizzesUsed < entitlements.dailyAiQuizzesLimit) {
      allowed = true;
      nextState.dailyQuizzesUsed += 1;
    } else if (state.boosterQuizzesRemaining > 0) {
      allowed = true;
      consumedFromBooster = true;
      nextState.boosterQuizzesRemaining -= 1;
    } else {
      allowed = false;
      reason = `Daily AI Quiz limit (${entitlements.dailyAiQuizzesLimit}/day) reached on ${entitlements.displayName}. Add an Exam Booster Pack (₹49 for +20 quizzes) or upgrade to Pro for unlimited quizzes.`;
    }
  }

  memoryQuotaStore.set(params.userId, nextState);

  if (allowed && params.supabase) {
    try {
      await params.supabase.from("user_subscriptions_and_quotas").upsert(
        {
          user_id: nextState.userId,
          plan_tier: nextState.planTier,
          active_pdf_count: nextState.activePdfCount,
          usage_date: nextState.usageDate,
          daily_explanations_used: nextState.dailyExplanationsUsed,
          daily_quizzes_used: nextState.dailyQuizzesUsed,
          booster_packs_purchased: nextState.boosterPacksPurchased,
          booster_explanations_remaining:
            nextState.boosterExplanationsRemaining,
          booster_quizzes_remaining: nextState.boosterQuizzesRemaining,
          updated_at: nextState.updatedAt,
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Local state already updated
    }
  }

  return {
    allowed,
    resource: params.resource,
    consumedFromBooster,
    reason,
    state: nextState,
  };
}
