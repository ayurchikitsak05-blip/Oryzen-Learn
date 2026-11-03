import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnvConfig } from "@/lib/supabase/client";

/**
 * Service-role client for server routes only. Use it solely for writes a student
 * must never make with their own session, such as marking a verified payment paid.
 */
export function createAdminClient(): SupabaseClient | null {
  const { url, isConfigured } = getSupabaseEnvConfig();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!isConfigured || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type VerifiedCheckout = {
  sessionId: string;
  userId: string;
  provider: "placeholder" | "stripe" | "razorpay";
  providerReference?: string | null;
};

/**
 * Marks a checkout paid and grants access, after the caller has verified the payment
 * with Razorpay or Stripe. The database function only runs for the service role.
 */
export async function completeVerifiedCheckout(
  input: VerifiedCheckout
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Payments are not fully configured on the server." };
  }
  const { error } = await admin.rpc("complete_verified_checkout", {
    p_session_id: input.sessionId,
    p_user_id: input.userId,
    p_provider: input.provider,
    p_provider_reference: input.providerReference ?? null,
  });
  if (error) {
    console.error("complete_verified_checkout failed", error.message);
    return { ok: false, error: "Payment was received but access could not be updated. Contact support." };
  }
  return { ok: true };
}
