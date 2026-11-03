import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Daily AI help allowance (owner plan, 3 Nov 2026).
 * Free: 5 new AI helps a day. Pro (paid or sponsored by a class): 40.
 * Saved (cached) answers never count. Illustrate, Story and Ask My Book count as 2.
 * The day runs on India time.
 */
export const DAILY_AI_HELPS = { free: 5, pro: 40 } as const;

/**
 * Monthly AI spend safety net per student, in rupees. The daily helps are the main limit;
 * this only stops a runaway month. About ₹0.17 a help: Free ₹25 covers 5 a day all month,
 * Pro ₹70 (the old flat cap) covers about 400 helps. Owner can lower these.
 */
export const MONTHLY_AI_CAP_INR = { free: 25, pro: 70 } as const;

export const MONTHLY_CAP_MESSAGE =
  "You've used this month's AI helps. Saved answers, reading, notes and practice still work. New helps arrive on the 1st.";

export type AllowancePlan = keyof typeof DAILY_AI_HELPS;

export function allowancePlanFor(accessStatus: string | null | undefined): AllowancePlan {
  return accessStatus === "active_paid" || accessStatus === "class_sponsored" ? "pro" : "free";
}

const DOUBLE_HELP_LENSES = new Set(["illustrative", "story", "ask_my_book"]);

export function helpCost(lensType: string): number {
  return DOUBLE_HELP_LENSES.has(lensType) ? 2 : 1;
}

/** Start of today in India (UTC+05:30), as an ISO timestamp in UTC. */
export function indiaDayStartIso(now: Date = new Date()): string {
  const offsetMs = 330 * 60 * 1000;
  const india = new Date(now.getTime() + offsetMs);
  const startIndia = Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate());
  return new Date(startIndia - offsetMs).toISOString();
}

export interface UsageRow {
  lens_type: string;
  cache_hit: boolean;
  cost_inr: number | string;
}

/** Helps used: only paid, non-cached requests count, weighted by lens. */
export function helpsUsed(rows: readonly UsageRow[]): number {
  return rows
    .filter((row) => !row.cache_hit && Number(row.cost_inr) > 0)
    .reduce((sum, row) => sum + helpCost(row.lens_type), 0);
}

export async function helpsUsedToday(
  supabase: SupabaseClient | null | undefined,
  userId: string,
  now: Date = new Date()
): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase
      .from("ai_usage_logs")
      .select("lens_type, cache_hit, cost_inr")
      .eq("user_id", userId)
      .gte("created_at", indiaDayStartIso(now));
    if (error || !Array.isArray(data)) return 0;
    return helpsUsed(data as UsageRow[]);
  } catch {
    return 0;
  }
}

export interface AllowanceStatus {
  plan: AllowancePlan;
  limit: number;
  used: number;
  left: number;
}

export function allowanceStatus(plan: AllowancePlan, used: number): AllowanceStatus {
  const limit = DAILY_AI_HELPS[plan];
  return { plan, limit, used, left: Math.max(0, limit - used) };
}

export function canSpendHelp(status: AllowanceStatus, lensType: string): boolean {
  return status.left >= helpCost(lensType);
}

export function allowanceMessage(status: AllowanceStatus): string {
  return status.plan === "pro"
    ? `You've used today's ${status.limit} AI helps. Saved answers, reading, notes and practice still work. New ones arrive at midnight.`
    : `You've used today's ${status.limit} free AI helps. Saved answers, reading, notes and practice still work. New ones arrive at midnight, or get Pro for 40 a day.`;
}
