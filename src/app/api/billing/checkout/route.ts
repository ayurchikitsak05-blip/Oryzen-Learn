import { NextResponse, type NextRequest } from "next/server";
import {
  canConfirmCheckoutInApp,
  directAccessOffer,
} from "@/lib/billing/direct-access";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "start" | "confirm";
      sessionId?: string;
    };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in before checkout." }, { status: 401 });
    }

    const offer = directAccessOffer();

    if (body.action === "confirm") {
      if (!body.sessionId) {
        return NextResponse.json({ error: "Checkout session is missing." }, { status: 400 });
      }
      if (!canConfirmCheckoutInApp(offer.provider)) {
        return NextResponse.json(
          {
            error:
              "Confirm this payment from the Razorpay or Stripe webhook before access is granted.",
          },
          { status: 501 }
        );
      }
      const { data, error } = await supabase.rpc("complete_direct_checkout", {
        session_id: body.sessionId,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ accessStatus: "active_paid", result: data });
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
      return NextResponse.json(
        { error: error?.message ?? "Could not start checkout." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sessionId: data.id,
      provider: data.provider,
      amountInr: data.amount_inr,
      mode: offer.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
