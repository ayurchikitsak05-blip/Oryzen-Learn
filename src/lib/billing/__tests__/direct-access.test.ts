import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canConfirmCheckoutInApp, resolvePaymentMode } from "@/lib/billing/direct-access";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("resolvePaymentMode", () => {
  it("uses a configured real provider", () => {
    expect(resolvePaymentMode({ PAYMENTS_PROVIDER: "razorpay", RAZORPAY_KEY_SECRET: "x", VERCEL_ENV: "production" })).toBe("razorpay");
    expect(resolvePaymentMode({ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "x", VERCEL_ENV: "production" })).toBe("stripe");
  });

  it("never falls back to free placeholder payments on Production", () => {
    expect(resolvePaymentMode({ VERCEL_ENV: "production" })).toBeNull();
    expect(resolvePaymentMode({ PAYMENTS_PROVIDER: "razorpay", VERCEL_ENV: "production" })).toBeNull();
    expect(resolvePaymentMode({ PAYMENTS_PROVIDER: "razorpai", RAZORPAY_KEY_SECRET: "x", VERCEL_ENV: "production" })).toBeNull();
    expect(canConfirmCheckoutInApp(resolvePaymentMode({ VERCEL_ENV: "production" }))).toBe(false);
  });

  it("allows the placeholder only off Production", () => {
    expect(resolvePaymentMode({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("placeholder");
    expect(resolvePaymentMode({})).toBe("placeholder");
  });

  it("treats a production server outside Vercel as Production", () => {
    expect(resolvePaymentMode({ NODE_ENV: "production" })).toBeNull();
  });
});

describe("paid access is granted only by the server after verification", () => {
  it("checkout and Stripe return never call the student-callable RPC", () => {
    for (const file of ["src/app/api/billing/checkout/route.ts", "src/app/api/billing/stripe/return/route.ts"]) {
      const src = read(file);
      expect(src).not.toContain("complete_direct_checkout");
      expect(src).toContain("completeVerifiedCheckout");
    }
  });

  it("the quotas route cannot upgrade a plan or add boosters", () => {
    const src = read("src/app/api/billing/quotas/route.ts");
    expect(src).not.toContain("upgrade_tier");
    expect(src).not.toContain("buy_booster");
  });

  it("the profile route does not accept an institute id from the browser", () => {
    expect(read("src/app/api/profile/prakriti/route.ts")).not.toContain("organizationId");
    expect(read("src/lib/supabase/profile-sync.ts")).not.toContain("organization_id");
  });

  it("the migration revokes the old RPC and restricts the new one to the service role", () => {
    const sql = read("supabase/migrations/20261103000001_lock_paid_access_and_profile_columns.sql");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.complete_direct_checkout\(UUID\) FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_verified_checkout\(UUID, UUID, TEXT, TEXT\) TO service_role/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.profiles/);
  });
});
