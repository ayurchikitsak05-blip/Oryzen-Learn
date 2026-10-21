"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
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
      router.push("/hub");
      router.refresh();
    } catch {
      setError("Network error while checking the class code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppChrome
      nav="marketing"
      subtitle="Your personal learning environment"
      maxWidthClass="max-w-3xl"
      actions={
        <button
          type="button"
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push("/auth");
            router.refresh();
          }}
          className={ui.ghost}
        >
          Sign out
        </button>
      }
    >
      <main className={ui.mainNarrow}>
        <p className={ui.eyebrow}>Access required</p>
        <h1 className={`${ui.heading} mt-3 text-4xl`}>
          Unlock Oryzen Learn
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          This account is signed in, and it does not have active, class, or trial access yet.
          Buy direct access, or enter the invite code from your instructor.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Link
            href="/pricing"
            className={`${ui.cardPad} flex min-h-[180px] flex-col justify-between bg-beige`}
          >
            <h2 className="text-xl font-semibold">Direct purchase</h2>
            <span className="text-sm font-medium">Buy direct access</span>
          </Link>
          <form
            onSubmit={redeem}
            className={`${ui.cardPad} flex min-h-[180px] flex-col justify-between`}
          >
            <div>
              <h2 className="text-xl font-semibold">Class invite code</h2>
              <label htmlFor="class-code" className="mt-4 block text-xs font-medium text-muted">
                Enter class invite code
                <input
                  id="class-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="ORYZEN-XXXX-XXXX"
                  className={`${ui.input} mt-2 uppercase`}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`${ui.secondary} mt-4 disabled:opacity-50`}
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
    </AppChrome>
  );
}
