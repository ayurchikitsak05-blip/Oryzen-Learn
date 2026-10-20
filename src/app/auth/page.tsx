"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  KeyRound,
  Mail,
  Smartphone,
  Tablet,
} from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import { detectDeviceCategory } from "@/lib/supabase/device-lock";
import type { DeviceCategory } from "@/lib/supabase/types";

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen />
    </Suspense>
  );
}

function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [useOneTimeCode, setUseOneTimeCode] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceCategory>("tablet");
  const [deviceId, setDeviceId] = useState("tablet-primary");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const detected = detectDeviceCategory(window.navigator.userAgent);
      const storageKey = "prakriti_local_device_id";
      const existingId = window.localStorage.getItem(storageKey);
      if (existingId) {
        setDeviceId(existingId);
      } else {
        const generated = `${detected}-${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(storageKey, generated);
        setDeviceId(generated);
      }
      setDeviceType(detected);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const finishSignIn = (nextPath: string) => {
    const requested = searchParams.get("next");
    const stayOnGate =
      requested?.startsWith("/access") ||
      requested?.startsWith("/pricing") ||
      requested?.startsWith("/checkout");
    if (nextPath === "/pricing" && stayOnGate && requested) {
      router.push(requested);
    } else {
      router.push(nextPath);
    }
    router.refresh();
  };

  const handlePasswordAuth = async (action: "sign_in" | "sign_up") => {
    setErrorMessage(null);
    setStatusMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          email,
          password,
          deviceId,
          deviceType,
        }),
      });
      const json = (await res.json()) as {
        status?: string;
        next?: string;
        error?: string;
      };
      if (!res.ok) {
        setErrorMessage(json.error ?? "Unable to sign in.");
      } else if (json.status === "confirm_email") {
        setStatusMessage("Check your email to confirm the account, then sign in.");
      } else {
        finishSignIn(json.next ?? "/pricing");
      }
    } catch {
      setErrorMessage("Network error while signing in.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          email,
          deviceId,
          deviceType,
        }),
      });
      const json = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) {
        setErrorMessage(json.error ?? "Unable to send OTP.");
      } else {
        setOtpSent(true);
        setStatusMessage(
          `6-digit verification code dispatched to ${email}. Enter it below to unlock your ${deviceType} slot.`
        );
      }
    } catch {
      setErrorMessage("Network error while requesting Email OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          email,
          token: otpToken,
          deviceId,
          deviceType,
          deviceLabel:
            deviceType === "tablet"
              ? "Primary Study Tablet"
              : "Companion Study Phone",
        }),
      });
      const json = (await res.json()) as {
        status?: string;
        next?: string;
        error?: string;
        deviceLock?: { revokedSessionIds: string[] };
      };

      if (!res.ok) {
        setErrorMessage(json.error ?? "Invalid OTP code.");
      } else {
        const revokedCount = json.deviceLock?.revokedSessionIds.length ?? 0;
        setStatusMessage(
          revokedCount > 0
            ? `Authenticated! Replaced ${revokedCount} older ${deviceType} session under the Strict 2-Device Lock.`
            : "Authenticated! Redirecting to Cognitive Energy Blueprint Assessment..."
        );
        finishSignIn(json.next ?? "/pricing");
      }
    } catch {
      setErrorMessage("Network error while verifying OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          deviceType,
          next: searchParams.get("next") ?? "/hub",
        }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setErrorMessage(
          json.error ??
            "Configure NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY to launch Google OAuth."
        );
      } else {
        window.location.href = json.url;
      }
    } catch {
      setErrorMessage("Failed to initiate Google OAuth redirect.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">
                Sign in to Oryzen Learn
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-8 md:px-8">
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 lg:col-span-5">
            <h2 className="text-xl font-bold">This device</h2>
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Study Tablet or Study Phone
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setDeviceType("tablet")}
                  className={`flex min-h-[64px] flex-col items-start justify-between rounded-xl border p-3.5 text-left transition-all ${
                    deviceType === "tablet"
                      ? "border-white bg-white text-zinc-950"
                      : "border-zinc-700 bg-zinc-950 text-zinc-100"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <Tablet className="h-5 w-5" />
                    {deviceType === "tablet" && (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-sm font-bold">Study Tablet</div>
                    <div className="text-[11px] opacity-85">
                      iPad / Android Tab
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setDeviceType("phone")}
                  className={`flex min-h-[64px] flex-col items-start justify-between rounded-xl border p-3.5 text-left transition-all ${
                    deviceType === "phone"
                      ? "border-white bg-white text-zinc-950"
                      : "border-zinc-700 bg-zinc-950 text-zinc-100"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <Smartphone className="h-5 w-5" />
                    {deviceType === "phone" && (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-sm font-bold">Study Phone</div>
                    <div className="text-[11px] opacity-85">
                      iPhone / Android
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* Right Pane: Email OTP & Google OAuth Sign-In */}
          <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 lg:col-span-7">
            <h2 className="text-lg font-bold">
              Email and password, or Google
            </h2>

            {statusMessage && (
              <div className="rounded-xl border border-emerald-700/30 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-900">
                {statusMessage}
              </div>
            )}

            {errorMessage && (
              <div className="rounded-xl border border-red-700/30 bg-red-50 p-3.5 text-xs font-medium text-red-900">
                {errorMessage}
              </div>
            )}

            {!useOneTimeCode ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePasswordAuth("sign_in");
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="student-email"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-5 w-5 text-zinc-400" />
                    <input
                      id="student-email"
                      type="email"
                      required
                      suppressHydrationWarning
                      placeholder="student@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="min-h-[48px] w-full rounded-xl border border-zinc-700 bg-zinc-950 pr-4 pl-11 text-sm font-medium focus:border-zinc-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="student-password"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400"
                  >
                    Password
                  </label>
                  <input
                    id="student-password"
                    type="password"
                    required
                    suppressHydrationWarning
                    minLength={8}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm font-medium focus:border-zinc-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  suppressHydrationWarning
                  disabled={loading}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 px-5 py-3 text-sm font-bold transition disabled:opacity-50"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handlePasswordAuth("sign_up")}
                  className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm font-bold"
                >
                  Create account
                </button>
                <button
                  type="button"
                  onClick={() => setUseOneTimeCode(true)}
                  className="text-xs font-semibold text-zinc-400 underline"
                >
                  Email me a one-time code instead
                </button>
              </form>
            ) : !otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="student-email"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400"
                  >
                    Student or Coaching Institute Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-5 w-5 text-zinc-400" />
                    <input
                      id="student-email"
                      type="email"
                      required
                      suppressHydrationWarning
                      placeholder="student@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="min-h-[48px] w-full rounded-xl border border-zinc-700 bg-zinc-950 pr-4 pl-11 text-sm font-medium focus:border-zinc-400 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  suppressHydrationWarning
                  disabled={loading}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 px-5 py-3 text-sm font-bold transition disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  {loading ? "Sending OTP..." : "Send 6-Digit Email OTP"}
                </button>
                <button
                  type="button"
                  onClick={() => setUseOneTimeCode(false)}
                  className="text-xs font-semibold text-zinc-400 underline"
                >
                  Use email and password instead
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="otp-code"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400"
                  >
                    Enter 6-Digit Verification Code sent to {email}
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-3.5 left-3.5 h-5 w-5 text-zinc-400" />
                    <input
                      id="otp-code"
                      type="text"
                      required
                      suppressHydrationWarning
                      maxLength={8}
                      placeholder="123456"
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value)}
                      className="min-h-[48px] w-full rounded-xl border border-zinc-700 bg-zinc-950 pr-4 pl-11 font-mono text-base font-bold tracking-widest focus:border-zinc-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 px-5 py-3 text-sm font-bold"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {loading
                      ? "Verifying & Locking Slot..."
                      : `Verify & Lock ${deviceType.toUpperCase()} Slot`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-xs font-semibold"
                  >
                    Change Email
                  </button>
                </div>
              </form>
            )}

            <div className="relative flex items-center py-1">
              <div className="grow border-t border-zinc-800" />
              <span className="mx-3 shrink text-xs font-semibold uppercase text-zinc-400">
                or continue with
              </span>
              <div className="grow border-t border-zinc-800" />
            </div>

            <button
              type="button"
              suppressHydrationWarning
              onClick={handleGoogleOAuth}
              disabled={loading}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm font-bold text-zinc-100 transition hover:bg-white disabled:opacity-50"
            >
              Continue with Google OAuth ({deviceType} slot)
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
