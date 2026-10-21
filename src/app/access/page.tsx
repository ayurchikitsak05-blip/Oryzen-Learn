"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import { createClient } from "@/lib/supabase/client";

export default function AccessRequiredPage() {
  return (
    <Suspense fallback={null}>
      <AccessRequiredScreen />
    </Suspense>
  );
}

function AccessRequiredScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redeem = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/access/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "That class code could not be used.");
        return;
      }
      router.push("/body-type");
      router.refresh();
    } catch {
      setError("Network error while checking the class code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between rounded-full border border-zinc-800 bg-zinc-900 px-5 py-2.5">
          <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
          <button
            type="button"
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              router.push("/auth");
              router.refresh();
            }}
            className="min-h-[44px] rounded-full px-3 text-sm font-medium text-zinc-400"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Access required
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Unlock Oryzen Learn
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-400">
          This account is signed in, and it does not have active, class, or trial access yet.
          Buy direct access, or enter the invite code from your instructor.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Link
            href="/pricing"
            className="flex min-h-[180px] flex-col justify-between rounded-3xl bg-white p-6 text-zinc-950"
          >
            <h2 className="text-xl font-semibold">Direct purchase</h2>
            <span className="text-sm font-medium">Buy direct access</span>
          </Link>
          <form
            onSubmit={redeem}
            className="flex min-h-[180px] flex-col justify-between rounded-3xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <div>
              <h2 className="text-xl font-semibold">Class invite code</h2>
              <label htmlFor="class-code" className="mt-4 block text-xs font-medium text-zinc-400">
                Enter class invite code
                <input
                  id="class-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="ORYZEN-XXXX-XXXX"
                  className="mt-2 min-h-[44px] w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 text-sm uppercase text-zinc-100"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-4 min-h-[44px] rounded-full border border-zinc-700 px-4 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Checking..." : "Unlock with class code"}
            </button>
          </form>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
