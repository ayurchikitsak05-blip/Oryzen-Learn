import { NextResponse, type NextRequest } from "next/server";
import {
  canConfirmCheckoutInApp,
  directAccessOffer,
  type PaymentProviderMode,
} from "@/lib/billing/direct-access";
import { razorpaySignature, signaturesMatch, stripeCheckoutForm } from "@/lib/billing/providers";
import { completeVerifiedCheckout, createAdminClient } from "@/lib/supabase/admin";
import {
  applySubscription,
  createSubscription,
  fetchSubscription,
  PRO_MONTH_DAYS,
  razorpayKeys,
  razorpayPlanId,
  LIVE_STATES,
  RENEWING_STATES,
  subscriptionSignature,
  type RazorpaySubscription,
} from "@/lib/billing/subscription";
import { createClient } from "@/lib/supabase/server";

type CheckoutBody = {
  action?: "start" | "confirm" | "razorpay" | "razorpay_subscription";
  subscriptionId?: string;
  sessionId?: string;
  orderId?: string;
  paymentId?: string;
  signature?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as CheckoutBody;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in before checkout." }, { status: 401 });
    }

    const offer = directAccessOffer();
    if (!offer.provider) {
      console.error("Checkout refused: no payment provider is configured on Production.");
      return NextResponse.json(
        { error: "Payments are temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    // Never take a payment we could not turn into access afterwards.
    if (!createAdminClient()) {
      console.error("Checkout refused: SUPABASE_SERVICE_ROLE_KEY is not configured.");
      return NextResponse.json(
        { error: "Payments are temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    if (body.action === "confirm") {
      return confirmPlaceholder(user.id, body.sessionId, offer.provider);
    }

    if (body.action === "razorpay") {
      return confirmRazorpay(user.id, body, offer.amountInr, offer.provider);
    }

    if (body.action === "razorpay_subscription") {
      return confirmRazorpaySubscription(user.id, body, offer.provider);
    }

    // A subscription that may still charge: never start a second one. One not yet paid is reused.
    let reuse: RazorpaySubscription | null = null;
    if (offer.provider === "razorpay" && razorpayPlanId()) {
      const admin = createAdminClient();
      const keys = razorpayKeys();
      const { data: current } = admin
        ? await admin.from("profiles").select("*").eq("id", user.id).maybeSingle()
        : { data: null };
      const savedId = (current as Record<string, unknown> | null)?.razorpay_subscription_id;
      if (keys && typeof savedId === "string") {
        const saved = await fetchSubscription(keys, savedId);
        if (saved && (LIVE_STATES as readonly string[]).includes(saved.status ?? "")) {
          return NextResponse.json(
            {
              error:
                "You already have a monthly Student Pro subscription. If a payment failed, complete it in your UPI app or card; to change it, stop auto-renew first on the Pricing page.",
            },
            { status: 409 }
          );
        }
        if (saved?.status === "created" && saved.plan_id === razorpayPlanId() && saved.notes?.user_id === user.id) reuse = saved;
      }
    }

    const { data, error } = await supabase
      .from("checkout_sessions")
      .insert({
        user_id: user.id,
        provider: offer.provider,
        status: "pending",
        amount_inr: offer.amountInr,
      })
      .select("id, provider, amount_inr, status")
      .single();

    if (error || !data) {
      const missingTable =
        /checkout_sessions/i.test(error?.message ?? "") &&
        /schema cache|does not exist/i.test(error?.message ?? "");
      console.error("checkout_sessions insert failed", error?.message, { missingTable });
      return NextResponse.json(
        {
          error: missingTable
            ? "Checkout is not available yet. Please try again later."
            : "Could not start checkout. Please try again.",
        },
        { status: 400 }
      );
    }

    const sessionId = String(data.id);
    if (offer.provider === "stripe") {
      const redirectUrl = await createStripeCheckoutUrl({
        secretKey: process.env.STRIPE_SECRET_KEY ?? "",
        checkoutId: sessionId,
        amountInr: offer.amountInr,
        origin: request.nextUrl.origin,
        email: user.email,
      });
      if (!redirectUrl) {
        return NextResponse.json(
          { error: "Stripe checkout could not start. Check the Stripe secret key." },
          { status: 502 }
        );
      }
      return NextResponse.json({
        sessionId,
        provider: offer.provider,
        amountInr: offer.amountInr,
        mode: offer.provider,
        confirmInApp: false,
        redirectUrl,
      });
    }

    if (offer.provider === "razorpay" && razorpayPlanId()) {
      // Monthly auto-renew (owner, 11 Nov 2026): a Razorpay subscription on the ₹149 plan.
      const keys = razorpayKeys();
      const planId = razorpayPlanId() as string;
      const subscription = reuse ?? (keys ? await createSubscription({ keys, planId, userId: user.id }) : null);
      const admin = createAdminClient();
      if (!keys || !subscription || !admin) {
        return NextResponse.json(
          { error: "Monthly checkout could not start. Please try again later." },
          { status: 502 }
        );
      }
      const { error: saveError } = await admin
        .from("profiles")
        .update({ razorpay_subscription_id: subscription.id, subscription_status: subscription.status ?? "created" })
        .eq("id", user.id);
      if (saveError) {
        return NextResponse.json({ error: "Monthly checkout could not start. Please try again later." }, { status: 503 });
      }
      return NextResponse.json({
        sessionId,
        provider: offer.provider,
        amountInr: offer.amountInr,
        mode: offer.provider,
        confirmInApp: false,
        razorpay: {
          keyId: keys.keyId,
          subscriptionId: subscription.id,
          name: "ORYZEN Learn",
          description: `Student Pro, ₹${offer.amountInr} a month, renews automatically`,
        },
      });
    }

    if (offer.provider === "razorpay") {
      const razorpay = await createRazorpayOrder(sessionId, offer.amountInr);
      if (!razorpay) {
        return NextResponse.json(
          { error: "Razorpay checkout could not start. Check the Razorpay keys." },
          { status: 502 }
        );
      }
      return NextResponse.json({
        sessionId,
        provider: offer.provider,
        amountInr: offer.amountInr,
        mode: offer.provider,
        confirmInApp: false,
        razorpay,
      });
    }

    return NextResponse.json({
      sessionId,
      provider: data.provider,
      amountInr: data.amount_inr,
      mode: offer.provider,
      confirmInApp: true,
    });
  } catch (err) {
    console.error("Checkout failed", err);
    return NextResponse.json({ error: "Checkout failed. Please try again." }, { status: 500 });
  }
}

async function confirmPlaceholder(
  userId: string,
  sessionId: string | undefined,
  provider: PaymentProviderMode
) {
  if (!sessionId) {
    return NextResponse.json({ error: "Checkout session is missing." }, { status: 400 });
  }
  if (!canConfirmCheckoutInApp(provider)) {
    return NextResponse.json(
      {
        error: "Confirm this payment from Razorpay or Stripe before access is granted.",
      },
      { status: 501 }
    );
  }
  // Placeholder confirmation only exists off Production (see resolvePaymentMode).
  const result = await completeVerifiedCheckout({ sessionId, userId, provider: "placeholder" });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ accessStatus: "active_paid" });
}

async function confirmRazorpay(
  userId: string,
  body: CheckoutBody,
  amountInr: number,
  provider: PaymentProviderMode
) {
  if (provider !== "razorpay") {
    return NextResponse.json({ error: "Razorpay is not the active payment provider." }, { status: 400 });
  }
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!secret || !keyId || !body.sessionId || !body.orderId || !body.paymentId || !body.signature) {
    return NextResponse.json({ error: "Razorpay payment details are incomplete." }, { status: 400 });
  }
  const expected = razorpaySignature(body.orderId, body.paymentId, secret);
  if (!signaturesMatch(expected, body.signature)) {
    return NextResponse.json({ error: "Razorpay payment could not be verified." }, { status: 400 });
  }
  const order = await fetchRazorpayOrder(body.orderId, keyId, secret);
  if (!order || order.receipt !== body.sessionId || order.amount !== amountInr * 100 || order.amount_paid !== amountInr * 100) {
    return NextResponse.json({ error: "Razorpay payment does not match this subscription." }, { status: 400 });
  }
  const result = await completeVerifiedCheckout({
    sessionId: body.sessionId,
    userId,
    provider: "razorpay",
    providerReference: body.paymentId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // A one-off payment (no monthly plan set up yet) covers one month, not forever.
  const admin = createAdminClient();
  if (admin) {
    const { data: row } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    const current = Date.parse(String((row as Record<string, unknown> | null)?.pro_until ?? "")) || 0;
    const next = Math.max(current, Date.now()) + PRO_MONTH_DAYS * 86_400_000;
    await admin.from("profiles").update({ pro_until: new Date(next).toISOString() }).eq("id", userId);
  }
  return NextResponse.json({ accessStatus: "active_paid" });
}

async function confirmRazorpaySubscription(userId: string, body: CheckoutBody, provider: PaymentProviderMode) {
  const keys = razorpayKeys();
  const planId = razorpayPlanId();
  const admin = createAdminClient();
  if (provider !== "razorpay" || !keys || !planId || !admin) {
    return NextResponse.json({ error: "Monthly payments aren't set up." }, { status: 400 });
  }
  if (!body.sessionId || !body.subscriptionId || !body.paymentId || !body.signature) {
    return NextResponse.json({ error: "Razorpay payment details are incomplete." }, { status: 400 });
  }
  const expected = subscriptionSignature(body.paymentId, body.subscriptionId, keys.secret);
  if (!signaturesMatch(expected, body.signature)) {
    return NextResponse.json({ error: "Razorpay payment could not be verified." }, { status: 400 });
  }
  const subscription = await fetchSubscription(keys, body.subscriptionId);
  if (
    !subscription ||
    subscription.notes?.user_id !== userId ||
    subscription.plan_id !== planId ||
    !(RENEWING_STATES as readonly string[]).includes(subscription.status ?? "")
  ) {
    return NextResponse.json({ error: "Razorpay payment does not match this subscription." }, { status: 400 });
  }
  const recorded = await completeVerifiedCheckout({
    sessionId: body.sessionId,
    userId,
    provider: "razorpay",
    providerReference: body.paymentId,
  });
  if (!recorded.ok) return NextResponse.json({ error: recorded.error }, { status: 400 });
  // Charged when Razorpay says active (or shows the paid month); otherwise the webhook turns Pro on.
  const charged = subscription.status === "active" || Boolean(subscription.current_end);
  const applied = await applySubscription(admin, { userId, subscription, charged });
  if (!applied.ok) {
    return NextResponse.json({ error: "Payment was received but access could not be updated. Contact support." }, { status: 500 });
  }
  return NextResponse.json(
    charged ? { accessStatus: "active_paid", proUntil: applied.proUntil } : { accessStatus: "pending", proUntil: null },
    { status: charged ? 200 : 202 }
  );
}

async function createStripeCheckoutUrl(input: {
  secretKey: string;
  checkoutId: string;
  amountInr: number;
  origin: string;
  email: string | undefined;
}): Promise<string | null> {
  if (!input.secretKey) return null;
  const body = stripeCheckoutForm({
    checkoutId: input.checkoutId,
    amountInr: input.amountInr,
    origin: input.origin,
    email: input.email,
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as { url?: string };
  return response.ok && json.url ? json.url : null;
}

async function createRazorpayOrder(checkoutId: string, amountInr: number) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return null;
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountInr * 100,
      currency: "INR",
      receipt: checkoutId,
    }),
  });
  const json = (await response.json()) as { id?: string };
  if (!response.ok || !json.id) return null;
  return {
    keyId,
    orderId: json.id,
    amount: amountInr * 100,
    currency: "INR" as const,
    name: "Oryzen Learn",
    description: "Student Pro monthly",
  };
}

async function fetchRazorpayOrder(orderId: string, keyId: string, secret: string) {
  const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    receipt?: string;
    amount?: number;
    amount_paid?: number;
  };
}
