"use client";

import React, { useEffect, useState } from "react";
import { ui } from "@/components/ui/classes";
import { DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

export type Plan = {
  pro: boolean;
  proUntil: string | null;
  paidThrough?: string | null;
  renewing: boolean;
  status: string | null;
};

/** The signed-in student's plan; null while loading or when signed out. `signedIn` is false only on a 401. */
export function usePlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch("/api/billing/subscription", { credentials: "same-origin" })
      .then((response) => {
        setSignedIn(response.status !== 401);
        return response.ok ? response.json() : null;
      })
      .then((json) => setPlan(json as Plan | null))
      .catch(() => setPlan(null));
  }, []);
  return { plan, setPlan, signedIn };
}

function dateLabel(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";
}

/** Shown on Pricing for a signed-in Pro student: next renewal, or when Pro ends, and Stop auto-renew. */
export function MyPlan({ plan, setPlan }: { plan: Plan | null; setPlan: (plan: Plan) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!plan?.pro) return null;
  const until = plan.paidThrough ?? plan.proUntil;

  const stop = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(json.error ?? "Auto-renew couldn't be stopped just now.");
        return;
      }
      setPlan({ ...plan, renewing: false, status: "cancelling" });
      setMessage("Auto-renew is off. You won't be charged again.");
    } catch {
      setMessage("No connection. Please try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className={`${ui.cardPad} mt-8 space-y-2`} data-testid="my-plan">
      <h2 className={`${ui.heading} text-lg`}>My plan: Student Pro</h2>
      {plan.renewing ? (
        <p className="text-sm text-ink" data-testid="my-plan-renews">
          Renews automatically for ₹{DIRECT_ACCESS_PRICE_INR}
          {until ? ` on ${dateLabel(until)}` : " every month"}. Razorpay sends a reminder before each
          charge.
        </p>
      ) : (
        <p className="text-sm text-ink" data-testid="my-plan-ends">
          {until ? `Pro stays on until ${dateLabel(until)}, then your account moves to the Free plan.` : "Pro is on."}
        </p>
      )}
      {plan.status === "pending" ? (
        <p className={ui.notice}>The last monthly payment didn&apos;t go through. Razorpay will try again; check your UPI app or card.</p>
      ) : null}
      {plan.renewing ? (
        confirming ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.ghost} onClick={() => setConfirming(false)}>
              Keep Pro
            </button>
            <button type="button" className={ui.secondary} onClick={() => void stop()} disabled={busy} data-testid="my-plan-stop">
              {busy ? "Stopping…" : "Yes, stop auto-renew"}
            </button>
          </div>
        ) : (
          <button type="button" className={ui.ghost} onClick={() => setConfirming(true)} data-testid="my-plan-stop-ask">
            Stop auto-renew
          </button>
        )
      ) : null}
      {message ? (
        <p className="text-sm text-muted" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
