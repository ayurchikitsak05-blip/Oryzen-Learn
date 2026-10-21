"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import SubscriptionCheckout from "@/components/billing/SubscriptionCheckout";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import { canonicalInviteCode, DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

const LOCAL_FEATURES = [
  "Your Reading Space",
  "Dictionary lookup",
  "Highlighting and underlining",
  "Auto-scroll",
  "Discover Your Learning Rhythm",
] as const;

export default function PricingPage() {
  const router = useRouter();
  const dialogTitleId = useId();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classOpen, setClassOpen] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [classError, setClassError] = useState<string | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [freeLoading, setFreeLoading] = useState(false);

  useEffect(() => {
    if (!classOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClassOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classOpen]);

  const startFree = async () => {
    setFreeLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/access/free", { method: "POST" });
      if (response.status === 401) {
        router.push("/auth?next=/pricing");
        return;
      }
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Free access could not start.");
        return;
      }
      router.push("/hub");
      router.refresh();
    } catch {
      setError("Network error while starting the free plan.");
    } finally {
      setFreeLoading(false);
    }
  };

  const redeemClassCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setClassLoading(true);
    setClassError(null);
    const code = canonicalInviteCode(classCode);
    try {
      const response = await fetch("/api/access/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.status === 401) {
        router.push(`/auth?next=${encodeURIComponent(`/access?code=${code}`)}`);
        return;
      }
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setClassError(json.error ?? "That class code could not be used.");
        return;
      }
      router.push("/hub");
      router.refresh();
    } catch {
      setClassError("Network error while checking the class code.");
    } finally {
      setClassLoading(false);
    }
  };

  return (
    <AppChrome
      nav="marketing"
      subtitle="Your personal learning environment"
      actions={
        <Link href="/auth" className={ui.secondary}>
          Sign in
        </Link>
      }
    >
      <main className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-16">
        <p className={ui.eyebrow}>Pricing</p>
        <h1 className={`${ui.heading} mt-3 max-w-2xl text-4xl`}>
          Choose how you study
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Local reading tools stay unlimited on every plan. Monthly caps apply only to
          video notes and connected study guides, so usage stays predictable.
        </p>

        <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-3">
          <article className={`${ui.cardPad} flex flex-col`}>
            <h2 className={`${ui.heading} text-lg`}>Free Explorer</h2>
            <p className="mt-4 font-display text-4xl text-heading">₹0</p>
            <p className="mt-1 text-sm text-muted">No card required</p>
            <QuotaList
              items={["5 AI runs / month"]}
            />
            <LocalFeatureList />
            <button
              type="button"
              onClick={() => void startFree()}
              disabled={freeLoading}
              className={`${ui.secondary} mt-6 disabled:opacity-50`}
            >
              {freeLoading ? "Starting free..." : "Start free"}
            </button>
          </article>

          <article className={`${ui.cardPad} relative mt-5 flex flex-col bg-selected lg:mt-0`}>
            <span className="absolute -top-3 left-6 rounded-full border border-beige bg-beige px-3 py-1 text-xs font-medium text-heading">
              Most popular
            </span>
            <h2 className={`${ui.heading} text-lg`}>Student Pro</h2>
            <p className="mt-4 font-display text-4xl text-heading">
              ₹{DIRECT_ACCESS_PRICE_INR}
              <span className="text-base font-medium text-muted"> / month</span>
            </p>
            <p className="mt-1 text-sm text-muted">For a full study load</p>
            <QuotaList
              items={[
                "120 video notes / month",
                "60 connected study guides / month",
              ]}
            />
            <LocalFeatureList />
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCheckoutOpen(true);
              }}
              className={`${ui.primary} mt-6`}
            >
              Subscribe Now
            </button>
          </article>

          <article className={`${ui.cardPad} flex flex-col`}>
            <h2 className={`${ui.heading} text-lg`}>Class / Institute</h2>
            <p className="mt-4 font-display text-4xl text-heading">Custom</p>
            <p className="mt-1 text-sm text-muted">Bulk seats for a cohort</p>
            <QuotaList
              items={[
                "AI allowance set for the batch",
                "Invite codes for every seat",
                "Grant and revoke student access",
              ]}
            />
            <LocalFeatureList />
            <button
              type="button"
              onClick={() => {
                setClassError(null);
                setClassOpen(true);
              }}
              className={`${ui.secondary} mt-6`}
            >
              Enter class invite code
            </button>
          </article>
        </div>

        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
          Student Pro opens a checkout for ₹{DIRECT_ACCESS_PRICE_INR}/month. Razorpay or Stripe
          runs when those keys are set. Until then, confirming the session activates the account.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
      </main>
      <SubscriptionCheckout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />

      {classOpen && (
        <div
          className={ui.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClassOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className={ui.modal}
          >
            <h2 id={dialogTitleId} className={`${ui.heading} text-xl`}>
              Class / Institute access
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Enter the invite code from your instructor, or ask for batch seats.
            </p>
            <form onSubmit={redeemClassCode} className="mt-5 space-y-3">
              <label htmlFor="pricing-class-code" className="block text-xs font-medium text-muted">
                Class invite code
                <input
                  id="pricing-class-code"
                  autoFocus
                  value={classCode}
                  onChange={(event) => setClassCode(event.target.value)}
                  placeholder="ORYZEN-XXXX-XXXX"
                  className={`${ui.input} mt-1 uppercase`}
                />
              </label>
              <button
                type="submit"
                disabled={classLoading}
                className={`${ui.primary} w-full disabled:opacity-50`}
              >
                {classLoading ? "Checking..." : "Unlock with class code"}
              </button>
            </form>
            {classError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {classError}
              </p>
            )}
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-sm font-medium text-heading">Contact for batch access</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Institutes can purchase seats and distribute invite codes from the class desk.
              </p>
              <a
                href="mailto:?subject=Oryzen%20Learn%20batch%20access&body=We%20would%20like%20batch%20seats%20for%20Oryzen%20Learn."
                className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium underline"
              >
                Contact for batch access
              </a>
            </div>
            <button
              type="button"
              onClick={() => setClassOpen(false)}
              className={`${ui.ghost} mt-4`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AppChrome>
  );
}

function QuotaList({ items }: { items: readonly string[] }) {
  return (
    <div className="mt-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        Monthly limits
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function LocalFeatureList() {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        Unlimited on this device
      </p>
      <ul className="mt-2 space-y-2 text-sm text-ink">
        {LOCAL_FEATURES.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
