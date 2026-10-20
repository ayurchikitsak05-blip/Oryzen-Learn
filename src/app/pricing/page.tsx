"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import { canonicalInviteCode, DIRECT_ACCESS_PRICE_INR } from "@/lib/access/gate";

const LOCAL_FEATURES = [
  "Focus Reader",
  "Dictionary lookup",
  "Highlighting and underlining",
  "Auto-scroll",
  "Constitutional body-type assessment",
] as const;

export default function PricingPage() {
  const router = useRouter();
  const dialogTitleId = useId();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [provider, setProvider] = useState("placeholder");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classOpen, setClassOpen] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [classError, setClassError] = useState<string | null>(null);
  const [classLoading, setClassLoading] = useState(false);

  useEffect(() => {
    if (!classOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClassOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classOpen]);

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
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
      const json = (await response.json()) as {
        sessionId?: string;
        provider?: string;
        error?: string;
      };
      if (!response.ok || !json.sessionId) {
        setError(json.error ?? "Checkout could not start.");
        return;
      }
      setSessionId(json.sessionId);
      setProvider(json.provider ?? "placeholder");
    } catch {
      setError("Network error while starting checkout.");
    } finally {
      setLoading(false);
    }
  };

  const confirmCheckout = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", sessionId }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Payment could not be confirmed.");
        return;
      }
      router.push("/hub");
      router.refresh();
    } catch {
      setError("Network error while confirming payment.");
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-[#FAF7F0] text-[#2C221E]">
      <header className="px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-amber-200/50 bg-[#FDFBF7] px-5 py-2.5 shadow-lg shadow-amber-900/10">
          <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
          <Link
            href="/auth"
            className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-[#645147]"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-16">
        <p className="text-xs font-medium uppercase tracking-widest text-[#645147]">
          Pricing
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight">
          Choose how you study
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#645147]">
          Local reading tools stay unlimited on every plan. Monthly caps apply only to AI
          video notes and multi-PDF work, so usage stays predictable.
        </p>

        <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-3">
          <article className="flex flex-col rounded-3xl border border-amber-200/50 bg-[#FDFBF7] p-6 shadow-lg shadow-amber-900/10">
            <h2 className="text-lg font-semibold">Free Explorer</h2>
            <p className="mt-4 text-4xl font-semibold tracking-tight">₹0</p>
            <p className="mt-1 text-sm text-[#645147]">No card required</p>
            <QuotaList
              items={["5 AI runs / month"]}
            />
            <LocalFeatureList />
            <Link
              href="/auth?next=/hub"
              className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full border border-amber-200/50 bg-[#FAF7F0] px-4 text-sm font-medium text-[#2C221E]"
            >
              Start free
            </Link>
          </article>

          <article className="relative flex flex-col rounded-3xl border-2 border-amber-700 bg-[#FDFBF7] p-6 shadow-lg shadow-amber-900/10">
            <span className="absolute -top-3 left-6 rounded-full bg-amber-700 px-3 py-1 text-xs font-medium text-white">
              Most popular
            </span>
            <h2 className="text-lg font-semibold">Student Pro</h2>
            <p className="mt-4 text-4xl font-semibold tracking-tight">
              ₹{DIRECT_ACCESS_PRICE_INR}
              <span className="text-base font-medium text-[#645147]"> / month</span>
            </p>
            <p className="mt-1 text-sm text-[#645147]">For a full study load</p>
            <QuotaList
              items={[
                "120 AI video notes / month",
                "60 multi-PDF runs / month",
              ]}
            />
            <LocalFeatureList />
            {!sessionId ? (
              <button
                type="button"
                onClick={() => void startCheckout()}
                disabled={loading}
                className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-amber-700 px-4 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {loading ? "Starting checkout..." : "Subscribe Now"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void confirmCheckout()}
                disabled={loading}
                className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-amber-700 px-4 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {loading ? "Confirming..." : "Confirm payment"}
              </button>
            )}
          </article>

          <article className="flex flex-col rounded-3xl border border-amber-200/50 bg-[#FDFBF7] p-6 shadow-lg shadow-amber-900/10">
            <h2 className="text-lg font-semibold">Class / Institute</h2>
            <p className="mt-4 text-4xl font-semibold tracking-tight">Custom</p>
            <p className="mt-1 text-sm text-[#645147]">Bulk seats for a cohort</p>
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
              className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full border border-amber-200/50 bg-[#FAF7F0] px-4 text-sm font-medium text-[#2C221E]"
            >
              Enter class invite code
            </button>
          </article>
        </div>

        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-[#645147]">
          {provider === "placeholder"
            ? "Student Pro checkout is ready for Razorpay or Stripe. Until those keys are set, confirming the session activates the account."
            : `Student Pro uses ${provider}. Access starts after the provider confirms payment.`}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </main>

      {classOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2C221E]/40 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClassOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-md rounded-3xl border border-amber-200/50 bg-[#FDFBF7] p-6 shadow-2xl shadow-amber-900/10"
          >
            <h2 id={dialogTitleId} className="text-xl font-semibold tracking-tight">
              Class / Institute access
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#645147]">
              Enter the invite code from your instructor, or ask for batch seats.
            </p>
            <form onSubmit={redeemClassCode} className="mt-5 space-y-3">
              <label htmlFor="pricing-class-code" className="block text-xs font-medium text-[#645147]">
                Class invite code
                <input
                  id="pricing-class-code"
                  autoFocus
                  value={classCode}
                  onChange={(event) => setClassCode(event.target.value)}
                  placeholder="ORYZEN-XXXX-XXXX"
                  className="mt-1 min-h-[44px] w-full rounded-2xl border border-amber-200/50 bg-[#FAF7F0] px-3 text-sm uppercase text-[#2C221E]"
                />
              </label>
              <button
                type="submit"
                disabled={classLoading}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-amber-700 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {classLoading ? "Checking..." : "Unlock with class code"}
              </button>
            </form>
            {classError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {classError}
              </p>
            )}
            <div className="mt-5 border-t border-amber-200/50 pt-4">
              <p className="text-sm font-medium">Contact for batch access</p>
              <p className="mt-1 text-sm leading-relaxed text-[#645147]">
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
              className="mt-4 min-h-[44px] text-sm font-medium text-[#645147]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuotaList({ items }: { items: readonly string[] }) {
  return (
    <div className="mt-6">
      <p className="text-xs font-medium uppercase tracking-wide text-[#645147]">
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
      <p className="text-xs font-medium uppercase tracking-wide text-[#645147]">
        Unlimited on this device
      </p>
      <ul className="mt-2 space-y-2 text-sm text-[#2C221E]">
        {LOCAL_FEATURES.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
