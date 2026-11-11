/**
 * Student Pro renews automatically every month through Razorpay Subscriptions
 * (owner, 11 Nov 2026). Razorpay handles the mandate (UPI AutoPay or card), the
 * reminder before each charge and retries; the server moves `pro_until` forward on
 * each charge and returns the student to Free when Pro runs out.
 */
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signaturesMatch } from "./providers";

const API = "https://api.razorpay.com/v1";
/** A few days to cover a charge that Razorpay is still retrying. */
export const PRO_GRACE_DAYS = 2;
/** When Razorpay doesn't say when the month ends: one month and a day. */
export const PRO_MONTH_DAYS = 31;
/** Monthly charges for up to 10 years; the student can cancel any time. */
export const SUBSCRIPTION_TOTAL_COUNT = 120;
/** Razorpay states in which the student keeps renewing. */
export const RENEWING_STATES = ["authenticated", "active"] as const;

export interface RazorpayKeys {
  keyId: string;
  secret: string;
}

export interface RazorpaySubscription {
  id: string;
  plan_id?: string;
  status?: string;
  current_end?: number | null;
  charge_at?: number | null;
  ended_at?: number | null;
  notes?: Record<string, string> | null;
}

export function razorpayKeys(env: NodeJS.ProcessEnv = process.env): RazorpayKeys | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const secret = env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && secret ? { keyId, secret } : null;
}

/** The ₹149 monthly plan made once in the Razorpay dashboard. */
export function razorpayPlanId(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.RAZORPAY_PLAN_ID?.trim();
  return value && value.startsWith("plan_") ? value : null;
}

function auth(keys: RazorpayKeys): string {
  return `Basic ${Buffer.from(`${keys.keyId}:${keys.secret}`).toString("base64")}`;
}

/** Checkout success signature for a subscription: HMAC of "payment_id|subscription_id". */
export function subscriptionSignature(paymentId: string, subscriptionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
}

/** Razorpay signs each notice (webhook) with the webhook secret. */
export function webhookSignatureValid(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signaturesMatch(expected, signature);
}

/** Until when Pro is paid: the end of the month Razorpay has charged for, plus a short grace. */
export function proUntilFor(subscription: Pick<RazorpaySubscription, "current_end">, now: Date = new Date()): Date {
  const end = subscription.current_end ? subscription.current_end * 1000 : now.getTime() + PRO_MONTH_DAYS * 86_400_000;
  return new Date(Math.max(end, now.getTime()) + PRO_GRACE_DAYS * 86_400_000);
}

export async function createSubscription(input: {
  keys: RazorpayKeys;
  planId: string;
  userId: string;
  fetchImpl?: typeof fetch;
}): Promise<RazorpaySubscription | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${API}/subscriptions`, {
    method: "POST",
    headers: { Authorization: auth(input.keys), "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: input.planId,
      total_count: SUBSCRIPTION_TOTAL_COUNT,
      quantity: 1,
      customer_notify: 1,
      notes: { user_id: input.userId },
    }),
  }).catch(() => null);
  if (!response?.ok) return null;
  const json = (await response.json().catch(() => null)) as RazorpaySubscription | null;
  return json?.id ? json : null;
}

export async function fetchSubscription(
  keys: RazorpayKeys,
  subscriptionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RazorpaySubscription | null> {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null;
  const response = await fetchImpl(`${API}/subscriptions/${subscriptionId}`, { headers: { Authorization: auth(keys) } }).catch(
    () => null
  );
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as RazorpaySubscription | null;
}

/** Stops renewing at the end of the month already paid for. */
export async function cancelSubscription(
  keys: RazorpayKeys,
  subscriptionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RazorpaySubscription | null> {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null;
  const response = await fetchImpl(`${API}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { Authorization: auth(keys), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as RazorpaySubscription | null;
}

interface ProfileBilling {
  id: string;
  access_status: string | null;
  pro_until: string | null;
  razorpay_subscription_id: string | null;
}

/**
 * Records the subscription on the student's profile. A charged (active or authenticated)
 * subscription turns Pro on and moves pro_until forward, never back.
 */
export async function applySubscription(
  admin: SupabaseClient,
  input: { userId: string; subscription: RazorpaySubscription; charged: boolean; now?: Date }
): Promise<{ ok: boolean; proUntil: string | null }> {
  const now = input.now ?? new Date();
  const { data } = await admin
    .from("profiles")
    .select("id, access_status, pro_until, razorpay_subscription_id")
    .eq("id", input.userId)
    .maybeSingle();
  const profile = data as ProfileBilling | null;
  if (!profile) return { ok: false, proUntil: null };
  const patch: Record<string, unknown> = {
    razorpay_subscription_id: input.subscription.id,
    subscription_status: input.subscription.status ?? null,
  };
  let proUntil = profile.pro_until;
  if (input.charged) {
    const next = proUntilFor(input.subscription, now);
    const current = profile.pro_until ? Date.parse(profile.pro_until) : 0;
    proUntil = new Date(Math.max(next.getTime(), current)).toISOString();
    patch.pro_until = proUntil;
    // Sponsored (class) students keep their class access; everyone else becomes Pro.
    if (profile.access_status !== "class_sponsored") {
      patch.access_status = "active_paid";
      if (profile.access_status !== "active_paid") patch.access_granted_at = now.toISOString();
    }
  }
  const { error } = await admin.from("profiles").update(patch).eq("id", input.userId);
  return { ok: !error, proUntil };
}

export interface WebhookEvent {
  event?: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
  };
}

/** Notices from Razorpay that change a student's Pro. */
const CHARGED_EVENTS = new Set(["subscription.authenticated", "subscription.activated", "subscription.charged", "subscription.resumed"]);
const STATUS_EVENTS = new Set(["subscription.pending", "subscription.halted", "subscription.cancelled", "subscription.completed", "subscription.paused"]);

/**
 * Applies one notice from Razorpay, once. Returns what happened, for the log.
 * The student is found from the subscription's notes (set when it was made) and must match
 * the subscription saved on their profile, unless they have none yet.
 */
export async function handleWebhookEvent(
  admin: SupabaseClient,
  input: { eventId: string; body: WebhookEvent; now?: Date }
): Promise<"applied" | "duplicate" | "ignored" | "unknown_student"> {
  const event = input.body.event ?? "";
  const subscription = input.body.payload?.subscription?.entity;
  if (!subscription?.id || (!CHARGED_EVENTS.has(event) && !STATUS_EVENTS.has(event))) return "ignored";
  const userId = subscription.notes?.user_id ?? null;

  const { error: duplicate } = await admin
    .from("razorpay_events")
    .insert({ event_id: input.eventId, event, subscription_id: subscription.id, user_id: userId });
  if (duplicate) return "duplicate";
  if (!userId) return "unknown_student";

  const { data } = await admin.from("profiles").select("razorpay_subscription_id").eq("id", userId).maybeSingle();
  const saved = (data as { razorpay_subscription_id: string | null } | null)?.razorpay_subscription_id ?? null;
  if (!data || (saved && saved !== subscription.id)) return "unknown_student";

  // "authenticated" without a charge yet only counts once Razorpay says the first payment went through.
  const charged = CHARGED_EVENTS.has(event) && (event !== "subscription.authenticated" || Boolean(subscription.current_end));
  await applySubscription(admin, { userId, subscription, charged, now: input.now });
  return "applied";
}
