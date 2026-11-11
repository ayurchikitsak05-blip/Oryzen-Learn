import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelSubscription, razorpayKeys } from "@/lib/billing/subscription";

/** The student's Pro: renewal date and status (GET), and stopping auto-renew (POST cancel). */
async function signedInProfile() {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!data?.user) return null;
  const { data: row } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  const profile = (row ?? {}) as Record<string, unknown>;
  return {
    userId: data.user.id,
    accessStatus: (profile.access_status as string | null) ?? null,
    proUntil: (profile.pro_until as string | null) ?? null,
    subscriptionId: (profile.razorpay_subscription_id as string | null) ?? null,
    subscriptionStatus: (profile.subscription_status as string | null) ?? null,
  };
}

export async function GET() {
  const profile = await signedInProfile();
  if (!profile) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({
    pro: profile.accessStatus === "active_paid",
    proUntil: profile.proUntil,
    renewing: Boolean(profile.subscriptionId) && ["authenticated", "active", "pending"].includes(profile.subscriptionStatus ?? ""),
    status: profile.subscriptionStatus,
  });
}

export async function POST(request: Request) {
  const profile = await signedInProfile();
  if (!profile) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "cancel") return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  const keys = razorpayKeys();
  const admin = createAdminClient();
  if (!keys || !admin || !profile.subscriptionId) {
    return NextResponse.json({ error: "There's no automatic renewal to stop." }, { status: 400 });
  }
  const cancelled = await cancelSubscription(keys, profile.subscriptionId);
  if (!cancelled) {
    return NextResponse.json({ error: "Auto-renew couldn't be stopped just now. Please try again." }, { status: 502 });
  }
  await admin
    .from("profiles")
    .update({ subscription_status: cancelled.status === "cancelled" ? "cancelled" : "cancelling" })
    .eq("id", profile.userId);
  return NextResponse.json({ ok: true, proUntil: profile.proUntil });
}
