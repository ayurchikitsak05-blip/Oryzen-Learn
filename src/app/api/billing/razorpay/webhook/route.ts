import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleWebhookEvent, webhookSignatureValid, type WebhookEvent } from "@/lib/billing/subscription";

/**
 * Razorpay tells us here when a monthly charge goes through, fails, or a subscription stops.
 * Set this URL and RAZORPAY_WEBHOOK_SECRET in the Razorpay dashboard (Settings → Webhooks).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  let body: WebhookEvent;
  try {
    body = JSON.parse(raw) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: "Bad body." }, { status: 400 });
  }
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `${body.event ?? "event"}:${body.payload?.subscription?.entity?.id ?? "none"}:${body.payload?.subscription?.entity?.current_end ?? ""}`;
  const result = await handleWebhookEvent(admin, { eventId, body });
  if (result === "unknown_student") {
    console.warn(JSON.stringify({ event: "razorpay_webhook_unknown_student", type: body.event ?? null }));
  }
  // Always 200 for a signed notice, so Razorpay doesn't keep resending it.
  return NextResponse.json({ ok: true, result });
}
