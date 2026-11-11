"use client";

import React, { useEffect, useState } from "react";
import { ui } from "@/components/ui/classes";
import { DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

type Plan = { pro: boolean; proUntil: string | null; renewing: boolean; status: string | null };

function dateLabel(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";
}

/** Shown on Pricing for a signed-in Pro student: next renewal, or when Pro ends, and Stop auto-renew. */
export function MyPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/billing/subscription", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => setPlan(json as Plan | null))
      .catch(() => setPlan(null));
  }, []);

  if (!plan?.pro) return null;

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
          {plan.proUntil ? ` around ${dateLabel(plan.proUntil)}` : " every month"}. Razorpay sends a reminder before each
          charge.
        </p>
      ) : (
        <p className="text-sm text-ink" data-testid="my-plan-ends">
          {plan.proUntil ? `Pro stays on until ${dateLabel(plan.proUntil)}, then your account moves to the Free plan.` : "Pro is on."}
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
