"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { detectDeviceCategory } from "@/lib/supabase/device-lock";
import {
  describeRecoveryLinkFailure,
  validateNewPasswordInput,
} from "@/lib/supabase/password-reset";

const labelClass =
  "mb-1.5 block text-xs tracking-[0.14em] text-[#A1A1AA] uppercase";
const inputClass =
  "min-h-12 w-full rounded-xl border border-white/10 bg-[#050505] px-4 text-sm text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-white/30";
const primaryButtonClass =
  "flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50";
const noticeClass =
  "rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-sm leading-relaxed text-[#E2E8F0]";

export type ResetPasswordFixture = "ready" | "expired" | "invalid" | null;

type SessionState = "checking" | "ready" | "missing" | "expired" | "invalid";

type Props = {
  allowFixtures: boolean;
  fixture: ResetPasswordFixture;
};

export function ResetPasswordClient({ allowFixtures, fixture }: Props) {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>(
    allowFixtures && fixture ? fixture : "checking"
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (allowFixtures && fixture) {
      if (fixture === "expired") {
        setErrorMessage(
          describeRecoveryLinkFailure({ errorCode: "otp_expired" })
        );
      } else if (fixture === "invalid") {
        setErrorMessage(
          describeRecoveryLinkFailure({ errorDescription: "invalid link" })
        );
      } else {
        setStatusMessage("Choose a new password for your account.");
      }
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const supabase = createClient();
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser();
          if (error || !user) {
            setSessionState("missing");
            setErrorMessage(
              "That recovery session is missing or has expired. Request a new password email from the sign-in page."
            );
            return;
          }
          setSessionState("ready");
          setStatusMessage("Choose a new password for your account.");
        } catch {
          setSessionState("missing");
          setErrorMessage(
            "That recovery session could not be verified. Request a new password email from the sign-in page."
          );
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allowFixtures, fixture]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const validation = validateNewPasswordInput({ password, confirmPassword });
    if (!validation.ok) {
      setErrorMessage(validation.error);
      return;
    }

    if (allowFixtures && fixture === "ready") {
      setLoading(true);
      window.setTimeout(() => {
        setLoading(false);
        setStatusMessage("Password updated. You can continue to study.");
        setSessionState("ready");
      }, 200);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          confirmPassword,
          deviceId: window.localStorage.getItem("prakriti_local_device_id"),
          deviceType: detectDeviceCategory(window.navigator.userAgent),
        }),
      });
      const json = (await res.json()) as {
        status?: string;
        next?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (json.code === "recovery_session_missing") {
          setSessionState("missing");
        }
        setErrorMessage(json.error ?? "Unable to update that password.");
        setLoading(false);
        return;
      }
      setStatusMessage("Password updated. Continuing…");
      if (json.next) {
        router.replace(json.next);
        router.refresh();
        return;
      }
      setLoading(false);
    } catch {
      setErrorMessage("Network error while updating that password.");
      setLoading(false);
    }
  };

  const showForm = sessionState === "ready";

  return (
    <div className="min-h-screen bg-[#050505] text-[#FAFAFA]">
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
        <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-3 self-start">
          <Image
            src="/logo.png"
            alt="Oryzen Learn"
            width={48}
            height={48}
            className="h-12 w-12 rounded-2xl object-cover"
          />
          <span>
            <span className="block text-sm font-medium tracking-tight text-[#FAFAFA]">
              Oryzen Learn
            </span>
            <span className="block text-[11px] text-[#71717A]">
              Adaptive Intelligence & Focus Reader
            </span>
          </span>
        </Link>

        <section className="rounded-2xl border border-white/10 bg-[#101010] p-6 sm:p-8">
          <h1 className="text-3xl font-medium tracking-tight text-[#FAFAFA]">
            Set new password
          </h1>
          <p className="mt-2 text-sm text-[#71717A]">
            Choose a password only after opening the recovery link from your email.
          </p>

          <div className="mt-6 space-y-4">
            {statusMessage && (
              <div role="status" className={noticeClass} data-testid="reset-status">
                {statusMessage}
              </div>
            )}
            {errorMessage && (
              <div role="alert" className={noticeClass} data-testid="reset-error">
                {errorMessage}
              </div>
            )}

            {sessionState === "checking" && (
              <p className="text-sm text-[#A1A1AA]" data-testid="reset-loading">
                Checking your recovery link…
              </p>
            )}

            {showForm && (
              <form
                suppressHydrationWarning
                onSubmit={(event) => {
                  void handleSubmit(event);
                }}
                className="space-y-4"
                data-testid="reset-password-form"
              >
                <div>
                  <label htmlFor="new-password" className={labelClass}>
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    suppressHydrationWarning
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    data-testid="reset-password-input"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className={labelClass}>
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    suppressHydrationWarning
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    data-testid="reset-confirm-input"
                  />
                </div>
                <button
                  type="submit"
                  suppressHydrationWarning
                  disabled={loading}
                  className={primaryButtonClass}
                  data-testid="reset-submit"
                >
                  {loading ? "Saving password..." : "Save new password"}
                </button>
              </form>
            )}

            {!showForm && sessionState !== "checking" && (
              <Link
                href="/auth"
                className="inline-flex min-h-11 items-center text-sm text-[#A1A1AA] underline-offset-4 hover:text-[#E2E8F0] hover:underline"
                data-testid="reset-back-to-auth"
              >
                Back to sign in
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
