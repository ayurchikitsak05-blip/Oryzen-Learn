import { createHmac, timingSafeEqual } from "node:crypto";
import { DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

export function razorpaySignature(orderId: string, paymentId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

export function signaturesMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function stripeSessionGrantsAccess(input: {
  paymentStatus: string | null;
  clientReferenceId: string | null;
  amountTotal: number | null;
  checkoutId: string;
  amountInr?: number;
}): boolean {
  const amount = (input.amountInr ?? DIRECT_ACCESS_PRICE_INR) * 100;
  return (
    input.paymentStatus === "paid" &&
    input.clientReferenceId === input.checkoutId &&
    input.amountTotal === amount
  );
}

export function stripeSuccessUrl(origin: string, checkoutId: string): string {
  return `${origin}/api/billing/stripe/return?checkout=${checkoutId}&session_id={CHECKOUT_SESSION_ID}`;
}

export function stripeCheckoutForm(input: {
  checkoutId: string;
  amountInr: number;
  origin: string;
  email?: string;
}): string {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("client_reference_id", input.checkoutId);
  params.set("cancel_url", `${input.origin}/pricing`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "inr");
  params.set("line_items[0][price_data][unit_amount]", String(input.amountInr * 100));
  params.set("line_items[0][price_data][recurring][interval]", "month");
  params.set("line_items[0][price_data][product_data][name]", "Oryzen Learn Student Pro");
  if (input.email) params.set("customer_email", input.email);
  const success = stripeSuccessUrl(input.origin, input.checkoutId).replace(
    "{CHECKOUT_SESSION_ID}",
    ""
  );
  return `${params.toString()}&success_url=${encodeURIComponent(success)}{CHECKOUT_SESSION_ID}`;
}
