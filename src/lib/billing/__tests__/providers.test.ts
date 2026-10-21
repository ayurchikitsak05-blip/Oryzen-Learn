import { describe, expect, it } from "vitest";
import {
  razorpaySignature,
  signaturesMatch,
  stripeCheckoutForm,
  stripeSessionGrantsAccess,
} from "../providers";

describe("payment verification", () => {
  it("accepts a matching Razorpay signature and rejects a different one", () => {
    const signature = razorpaySignature("order_123", "pay_456", "secret");
    expect(signaturesMatch(signature, signature)).toBe(true);
    expect(signaturesMatch(signature, "not-the-signature")).toBe(false);
  });

  it("grants access only when Stripe reports this checkout as paid for ₹199", () => {
    expect(
      stripeSessionGrantsAccess({
        paymentStatus: "paid",
        clientReferenceId: "checkout-1",
        amountTotal: 19900,
        checkoutId: "checkout-1",
      })
    ).toBe(true);
    expect(
      stripeSessionGrantsAccess({
        paymentStatus: "unpaid",
        clientReferenceId: "checkout-1",
        amountTotal: 19900,
        checkoutId: "checkout-1",
      })
    ).toBe(false);
    expect(
      stripeSessionGrantsAccess({
        paymentStatus: "paid",
        clientReferenceId: "other",
        amountTotal: 19900,
        checkoutId: "checkout-1",
      })
    ).toBe(false);
  });

  it("leaves the Stripe session placeholder unencoded in the checkout form", () => {
    const form = stripeCheckoutForm({
      checkoutId: "checkout-1",
      amountInr: 199,
      origin: "http://localhost:3000",
      email: "student@university.edu",
    });
    expect(form).toContain("client_reference_id=checkout-1");
    expect(form).toContain("{CHECKOUT_SESSION_ID}");
    expect(form).not.toContain("%7BCHECKOUT_SESSION_ID%7D");
    expect(form).toContain("unit_amount%5D=19900");
  });
});
