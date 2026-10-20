import { DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

export type PaymentProviderMode = "placeholder" | "stripe" | "razorpay";

export function resolvePaymentMode(): PaymentProviderMode {
  const requested = process.env.PAYMENTS_PROVIDER;
  if (requested === "stripe" && process.env.STRIPE_SECRET_KEY) return "stripe";
  if (requested === "razorpay" && process.env.RAZORPAY_KEY_SECRET) return "razorpay";
  return "placeholder";
}

export function directAccessOffer() {
  return {
    amountInr: DIRECT_ACCESS_PRICE_INR,
    provider: resolvePaymentMode(),
    label: "Direct Access",
  };
}

/**
 * Placeholder checkout confirms a pending session.
 * Stripe and Razorpay stay blocked until a verified webhook marks the session paid.
 */
export function canConfirmCheckoutInApp(mode: PaymentProviderMode): boolean {
  return mode === "placeholder";
}
