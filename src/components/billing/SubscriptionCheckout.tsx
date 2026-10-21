"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

type RazorpayCheckout = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
};

type StartedCheckout = {
  sessionId: string;
  provider: string;
  amountInr: number;
  confirmInApp: boolean;
  redirectUrl?: string;
  razorpay?: RazorpayCheckout;
};

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      order_id: string;
      handler: (response: RazorpaySuccess) => void;
      modal: { ondismiss: () => void };
      theme: { color: string };
    }) => RazorpayInstance;
  }
}

async function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout could not load."));
    document.body.appendChild(script);
  });
}

export default function SubscriptionCheckout({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [checkout, setCheckout] = useState<StartedCheckout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCheckout(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (response.status === 401) {
        router.push("/auth?next=/pricing");
        return;
      }
      const json = (await response.json()) as StartedCheckout & { error?: string };
      if (!response.ok || !json.sessionId) {
        setError(json.error ?? "Checkout could not start.");
        return;
      }
      setCheckout(json);
    } catch {
      setError("Network error while starting checkout.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open) {
        setCheckout(null);
        setError(null);
        return;
      }
      void start();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, start]);

  const finishPaid = () => {
    onClose();
    router.push("/hub");
    router.refresh();
  };

  const confirmInApp = async () => {
    if (!checkout) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", sessionId: checkout.sessionId }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Payment could not be confirmed.");
        return;
      }
      finishPaid();
    } catch {
      setError("Network error while confirming payment.");
    } finally {
      setLoading(false);
    }
  };

  const payWithRazorpay = async () => {
    if (!checkout?.razorpay) return;
    setLoading(true);
    setError(null);
    try {
      await loadRazorpay();
      const Razorpay = window.Razorpay;
      const order = checkout.razorpay;
      if (!Razorpay) {
        setError("Razorpay checkout could not load.");
        return;
      }
      const instance = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.orderId,
        theme: { color: "#E8D9C8" },
        modal: { ondismiss: () => setLoading(false) },
        handler: (payment) => {
          void verifyRazorpay(checkout.sessionId, payment);
        },
      });
      instance.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Razorpay checkout could not open.");
      setLoading(false);
    }
  };

  const verifyRazorpay = async (sessionId: string, payment: RazorpaySuccess) => {
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "razorpay",
          sessionId,
          orderId: payment.razorpay_order_id,
          paymentId: payment.razorpay_payment_id,
          signature: payment.razorpay_signature,
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Payment could not be verified.");
        return;
      }
      finishPaid();
    } catch {
      setError("Network error while verifying payment.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const providerLabel =
    checkout?.provider === "stripe"
      ? "Stripe"
      : checkout?.provider === "razorpay"
        ? "Razorpay"
        : "secure checkout";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--heading)_28%,transparent)] p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="surface-card w-full max-w-md p-6 shadow-[0_24px_60px_-28px_rgba(32,36,43,0.45)] [animation:oryzen-rise_180ms_ease]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Student Pro
            </p>
            <h2 id={titleId} className="mt-2 font-display text-2xl text-heading">
              ₹{checkout?.amountInr ?? DIRECT_ACCESS_PRICE_INR}
              <span className="text-base font-medium text-muted"> / month</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-beige-2 hover:text-heading"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {!checkout
            ? "Preparing Student Pro checkout."
            : checkout.confirmInApp
              ? "Card checkout is ready for Razorpay or Stripe. Until those keys are set, confirming this session activates Student Pro on your account."
              : `Continue in ${providerLabel}. Student Pro starts after the payment is verified.`}
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {checkout?.confirmInApp && (
            <button
              type="button"
              onClick={() => void confirmInApp()}
              disabled={loading}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {loading ? "Activating..." : "Confirm and activate"}
            </button>
          )}
          {checkout?.redirectUrl && (
            <button
              type="button"
              onClick={() => {
                window.location.assign(checkout.redirectUrl ?? "/pricing");
              }}
              className="btn-primary text-sm"
            >
              Continue to Stripe
            </button>
          )}
          {checkout?.razorpay && (
            <button
              type="button"
              onClick={() => void payWithRazorpay()}
              disabled={loading}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {loading ? "Opening Razorpay..." : "Pay with Razorpay"}
            </button>
          )}
          {!checkout && (
            <button
              type="button"
              onClick={() => void start()}
              disabled={loading}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {loading ? "Starting checkout..." : "Try again"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
