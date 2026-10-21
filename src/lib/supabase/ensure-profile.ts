import type { SupabaseClient } from "@supabase/supabase-js";

export interface SignedInProfile {
  access_status: string | null;
  role: string | null;
  prakriti_profile: unknown;
}

/**
 * Makes sure a signed-in student has a profile row. A brand-new account
 * starts on the free plan so sign-in can continue into the study hub
 * instead of waiting on an email confirmation loop. Paid, sponsored,
 * trial, and revoked statuses are left as they are. A full name is written
 * only when the caller provides one, and a revoked account stays revoked.
 */
export async function ensureSignedInProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  options?: { fullName?: string | null }
): Promise<SignedInProfile> {
  const fullName = options?.fullName?.trim() || "";
  const { data: existing } = await supabase
    .from("profiles")
    .select("access_status, role, prakriti_profile, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      ...(fullName ? { full_name: fullName } : {}),
    });
    if (insertError && fullName) {
      await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", user.id);
    }
  } else if (fullName && existing.full_name !== fullName) {
    await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", user.id);
  }

  if (!existing || existing.access_status === "none") {
    await supabase.rpc("activate_free_plan");
  }

  const { data: refreshed } = await supabase
    .from("profiles")
    .select("access_status, role, prakriti_profile")
    .eq("id", user.id)
    .maybeSingle();

  return {
    access_status: refreshed?.access_status ?? existing?.access_status ?? null,
    role: refreshed?.role ?? existing?.role ?? null,
    prakriti_profile:
      refreshed?.prakriti_profile ?? existing?.prakriti_profile ?? null,
  };
}
