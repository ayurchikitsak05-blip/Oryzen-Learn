import { NextResponse, type NextRequest } from "next/server";
import {
  canConfirmCheckoutInApp,
  directAccessOffer,
  type PaymentProviderMode,
} from "@/lib/billing/direct-access";
import { razorpaySignature, signaturesMatch, stripeCheckoutForm } from "@/lib/billing/providers";
import { createClient } from "@/lib/supabase/server";

type CheckoutBody = {
  action?: "start" | "confirm" | "razorpay";
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

    if (body.action === "confirm") {
      return confirmPlaceholder(supabase, body.sessionId, offer.provider);
    }

    if (body.action === "razorpay") {
      return confirmRazorpay(supabase, body, offer.amountInr, offer.provider);
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
      return NextResponse.json(
        {
          error: missingTable
            ? "Checkout is not installed on the database yet. Run supabase/bootstrap.sql in the Supabase SQL editor, then click Subscribe Now again."
            : (error?.message ?? "Could not start checkout."),
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
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function confirmPlaceholder(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  const { data, error } = await supabase.rpc("complete_direct_checkout", {
    session_id: sessionId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ accessStatus: "active_paid", result: data });
}

async function confirmRazorpay(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  const { data, error } = await supabase.rpc("complete_direct_checkout", {
    session_id: body.sessionId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ accessStatus: "active_paid", result: data });
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
