import { NextResponse, type NextRequest } from "next/server";
import { DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";
import { stripeSessionGrantsAccess } from "@/lib/billing/providers";
import { completeVerifiedCheckout } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const checkoutId = request.nextUrl.searchParams.get("checkout");
  const stripeSessionId = request.nextUrl.searchParams.get("session_id");
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!checkoutId || !stripeSessionId || !secret) {
    return NextResponse.redirect(`${origin}/pricing`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/auth?next=/pricing`);
  }

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(stripeSessionId)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  const session = (await response.json()) as {
    payment_status?: string;
    client_reference_id?: string | null;
    amount_total?: number | null;
  };
  const paid = stripeSessionGrantsAccess({
    paymentStatus: session.payment_status ?? null,
    clientReferenceId: session.client_reference_id ?? null,
    amountTotal: session.amount_total ?? null,
    checkoutId,
    amountInr: DIRECT_ACCESS_PRICE_INR,
  });
  if (!response.ok || !paid) {
    return NextResponse.redirect(`${origin}/pricing`);
  }

  const result = await completeVerifiedCheckout({
    sessionId: checkoutId,
    userId: user.id,
    provider: "stripe",
    providerReference: stripeSessionId,
  });
  if (!result.ok) {
    return NextResponse.redirect(`${origin}/pricing`);
  }
  return NextResponse.redirect(`${origin}/hub`);
}
