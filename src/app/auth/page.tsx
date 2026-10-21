"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Smartphone, Tablet } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import { tabClass, ui } from "@/components/ui/classes";
import { createClient } from "@/lib/supabase/client";
import { detectDeviceCategory } from "@/lib/supabase/device-lock";
import type { DeviceCategory } from "@/lib/supabase/types";

const labelClass = ui.label;
const inputClass = ui.input;
const primaryButtonClass = `${ui.primary} w-full`;
const secondaryButtonClass = `${ui.secondary} w-full`;
const noticeClass = ui.notice;

function describeAuthLinkError(params: URLSearchParams): string | null {
  const code = params.get("error_code");
  const description = params.get("error_description")?.replace(/\+/g, " ") ?? "";
  const error = params.get("error")?.replace(/\+/g, " ") ?? "";
  if (/code challenge/i.test(error) || /code challenge/i.test(description)) {
    return "That sign-in link could not be matched to this browser. Request a new email, or use your password.";
  }
  if (code === "otp_expired" || /expired|invalid/i.test(description)) {
    return "That email link is invalid or has already expired. Request a new email, or use your password.";
  }
  if (error) {
    return description || "The sign-in link could not be completed. Request a new email, or use your password.";
  }
  return null;
}

function readAuthLinkError(searchParams: { get(name: string): string | null }): string | null {
  const direct = describeAuthLinkError(
    new URLSearchParams(
      ["error", "error_code", "error_description"]
        .flatMap((key) => {
          const value = searchParams.get(key);
          return value ? [[key, value]] : [];
        })
    )
  );
  if (direct) return direct;
  const next = searchParams.get("next");
  if (!next) return null;
  try {
    return describeAuthLinkError(new URL(next, "http://localhost").searchParams);
  } catch {
    return null;
  }
}

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
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [useOneTimeCode, setUseOneTimeCode] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceCategory>("tablet");
  const [deviceId, setDeviceId] = useState("tablet-primary");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"sign_in" | "sign_up" | null>(null);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const linkError = readAuthLinkError(searchParams);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const hashError = hash.get("error_description") || hash.get("error");
        if (!accessToken || !refreshToken) {
          if (hashError) setErrorMessage(hashError.replace(/\+/g, " "));
          return;
        }
        setLoading(true);
        setErrorMessage(null);
        setStatusMessage("Signing you in from the email link...");
        try {
          const supabase = createClient();
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setErrorMessage(error.message);
            setLoading(false);
            return;
          }
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`
          );
          const res = await fetch("/api/auth/establish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId: window.localStorage.getItem("prakriti_local_device_id"),
              deviceType: detectDeviceCategory(window.navigator.userAgent),
            }),
          });
          const json = (await res.json()) as { next?: string; error?: string };
          if (!res.ok || !json.next) {
            setErrorMessage(json.error ?? "The sign-in link could not be completed.");
            setLoading(false);
            return;
          }
          setStatusMessage("Signed in.");
          router.replace(json.next);
          router.refresh();
        } catch {
          setErrorMessage("The sign-in link could not be completed.");
          setLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

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

  const selectMode = (nextMode: "sign_in" | "sign_up") => {
    setMode(nextMode);
    setUseOneTimeCode(false);
    setErrorMessage(null);
    setStatusMessage(null);
    setPasswordMismatch(false);
  };

  const handlePasswordAuth = async (action: "sign_in" | "sign_up" | "replace_password") => {
    setErrorMessage(null);
    setStatusMessage(null);
    setPasswordMismatch(false);
    setPendingAction(action === "replace_password" ? "sign_in" : action);
    setLoading(true);
    let redirecting = false;
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
          ...(action === "sign_up" ? { fullName: fullName.trim() } : {}),
        }),
      });
      const json = (await res.json()) as {
        status?: string;
        next?: string;
        created?: boolean;
        code?: string;
        error?: string;
      };
      if (!res.ok) {
        setPasswordMismatch(json.code === "password_mismatch");
        setErrorMessage(json.error ?? "Unable to sign in.");
      } else if (!json.next) {
        setErrorMessage("Signed in, but the next page was not returned.");
      } else if (json.created) {
        setStatusMessage("Account created successfully. Welcome.");
        redirecting = true;
        const nextPath = json.next;
        window.setTimeout(() => finishSignIn(nextPath), 900);
      } else if (action === "replace_password") {
        setStatusMessage("Password saved. You're signed in.");
        redirecting = true;
        const nextPath = json.next;
        window.setTimeout(() => finishSignIn(nextPath), 900);
      } else {
        redirecting = true;
        finishSignIn(json.next);
      }
    } catch {
      setErrorMessage("Network error while signing in.");
    } finally {
      if (!redirecting) {
        setPendingAction(null);
        setLoading(false);
      }
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
        setErrorMessage(json.error ?? "Unable to send the sign-in email.");
      } else {
        setOtpSent(true);
        setStatusMessage(
          "Check your email for “Your sign-in link”. Open the Sign in link in that message. That email does not include a numeric code."
        );
      }
    } catch {
      setErrorMessage("Network error while sending the sign-in email.");
    } finally {
      setLoading(false);
    }
  };

  const heading = mode === "sign_up" ? "Create account" : "Sign in";

  return (
    <AppChrome nav="marketing" subtitle="Your personal learning environment" maxWidthClass="max-w-lg">
      <main className="mx-auto flex w-full max-w-lg flex-col px-4 py-8">
        <section className={ui.cardPad}>
          <h1 className={`${ui.heading} text-3xl`}>{heading}</h1>
          <p className="mt-2 text-sm text-muted">
            {mode === "sign_up"
              ? "Email, password, and an optional name."
              : "Email and password for your account."}
          </p>

          <div role="tablist" aria-label="Account" className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              role="tab"
              id="auth-tab-sign-in"
              aria-selected={mode === "sign_in"}
              aria-controls="auth-panel"
              suppressHydrationWarning
              onClick={() => selectMode("sign_in")}
              className={tabClass(mode === "sign_in")}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              id="auth-tab-sign-up"
              aria-selected={mode === "sign_up"}
              aria-controls="auth-panel"
              suppressHydrationWarning
              onClick={() => selectMode("sign_up")}
              className={tabClass(mode === "sign_up")}
            >
              Sign Up
            </button>
          </div>

          <div id="auth-panel" role="tabpanel" className="mt-6 space-y-4">
            {statusMessage && (
              <div role="status" className={noticeClass}>
                {statusMessage}
              </div>
            )}

            {(errorMessage ?? linkError) && (
              <div className="space-y-3">
                <div role="alert" className={noticeClass}>
                  {errorMessage ?? linkError}
                </div>
                {passwordMismatch && (
                  <button
                    type="button"
                    suppressHydrationWarning
                    disabled={loading}
                    onClick={() => void handlePasswordAuth("replace_password")}
                    className={secondaryButtonClass}
                  >
                    {loading ? "Saving password..." : "Save this password and sign in"}
                  </button>
                )}
              </div>
            )}

            {useOneTimeCode ? (
              !otpSent ? (
                <form suppressHydrationWarning onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label htmlFor="student-email" className={labelClass}>
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-5 w-5 text-muted" />
                      <input
                        id="student-email"
                        type="email"
                        required
                        suppressHydrationWarning
                        autoComplete="email"
                        placeholder="student@university.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${inputClass} pr-4 pl-11`}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    suppressHydrationWarning
                    disabled={loading}
                    className={primaryButtonClass}
                  >
                    {loading ? "Sending email..." : "Email me a sign-in link"}
                  </button>
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setUseOneTimeCode(false)}
                    className="text-xs text-muted underline-offset-4 hover:text-heading hover:underline"
                  >
                    Use email and password instead
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted">
                    The email titled “Your sign-in link” has a Sign in link and no numeric code. Open that link to continue.
                  </p>
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => {
                      setOtpSent(false);
                      setUseOneTimeCode(false);
                    }}
                    className="text-xs text-muted underline-offset-4 hover:text-heading hover:underline"
                  >
                    Use a different email
                  </button>
                </div>
              )
            ) : mode === "sign_up" ? (
              <form
                suppressHydrationWarning
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePasswordAuth("sign_up");
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="student-name" className={labelClass}>
                    Full name <span className="normal-case tracking-normal text-muted">(optional)</span>
                  </label>
                  <input
                    id="student-name"
                    type="text"
                    suppressHydrationWarning
                    autoComplete="name"
                    placeholder="Your name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="student-email" className={labelClass}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-5 w-5 text-muted" />
                    <input
                      id="student-email"
                      type="email"
                      required
                      suppressHydrationWarning
                      autoComplete="email"
                      placeholder="student@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${inputClass} pr-4 pl-11`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="student-password" className={labelClass}>
                    Password
                  </label>
                  <input
                    id="student-password"
                    type="password"
                    required
                    suppressHydrationWarning
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  suppressHydrationWarning
                  disabled={loading}
                  className={primaryButtonClass}
                >
                  {pendingAction === "sign_up" ? "Creating account..." : "Create account"}
                </button>
                <p className="text-xs leading-relaxed text-muted">
                  Creating an account signs you in on this page. No confirmation email.
                </p>
              </form>
            ) : (
              <form
                suppressHydrationWarning
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePasswordAuth("sign_in");
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="student-email" className={labelClass}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-5 w-5 text-muted" />
                    <input
                      id="student-email"
                      type="email"
                      required
                      suppressHydrationWarning
                      autoComplete="email"
                      placeholder="student@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${inputClass} pr-4 pl-11`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="student-password" className={labelClass}>
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
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  suppressHydrationWarning
                  disabled={loading}
                  className={primaryButtonClass}
                >
                  {pendingAction === "sign_in" ? "Signing in..." : "Sign in"}
                </button>
              </form>
            )}

            {!useOneTimeCode && (
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => {
                  setUseOneTimeCode(true);
                  setErrorMessage(null);
                  setStatusMessage(null);
                  setPasswordMismatch(false);
                }}
                className="text-xs text-muted underline-offset-4 hover:text-heading hover:underline"
              >
                Email me a sign-in link instead
              </button>
            )}
          </div>
        </section>

        <section className={`${ui.card} mt-4 p-4`}>
          <p className={ui.eyebrow}>This device</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => setDeviceType("tablet")}
              className={`flex min-h-16 items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                deviceType === "tablet" ? ui.selected : ui.idle
              }`}
            >
              <Tablet className="h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm">Study Tablet</span>
                <span className="block text-[11px] text-muted">iPad / Android Tab</span>
              </span>
            </button>
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => setDeviceType("phone")}
              className={`flex min-h-16 items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                deviceType === "phone" ? ui.selected : ui.idle
              }`}
            >
              <Smartphone className="h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm">Study Phone</span>
                <span className="block text-[11px] text-muted">iPhone / Android</span>
              </span>
            </button>
          </div>
        </section>
      </main>
    </AppChrome>
  );
}
