import { DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

export type PaymentProviderMode = "placeholder" | "stripe" | "razorpay";

export function isProductionDeployment(
  env: { VERCEL_ENV?: string; NODE_ENV?: string } = process.env
): boolean {
  return env.VERCEL_ENV === "production";
}

/**
 * Picks the payment provider. Returns null when no real provider is configured
 * on Production: the free "placeholder" confirmation is for local and Preview only,
 * so a missing or misspelled Vercel setting can never hand out paid access.
 */
export function resolvePaymentMode(
  env: {
    PAYMENTS_PROVIDER?: string;
    STRIPE_SECRET_KEY?: string;
    RAZORPAY_KEY_SECRET?: string;
    VERCEL_ENV?: string;
    NODE_ENV?: string;
  } = process.env
): PaymentProviderMode | null {
  const requested = env.PAYMENTS_PROVIDER;
  if (requested === "stripe" && env.STRIPE_SECRET_KEY) return "stripe";
  if (requested === "razorpay" && env.RAZORPAY_KEY_SECRET) return "razorpay";
  return isProductionDeployment(env) ? null : "placeholder";
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
export function canConfirmCheckoutInApp(mode: PaymentProviderMode | null): boolean {
  return mode === "placeholder";
}
