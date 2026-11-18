"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { lockAccountVault } from "@/lib/privacy/account-vault";
import { ui } from "@/components/ui/classes";

/**
 * "Account and privacy" for a signed-in student: email, sign out, and a link to change the
 * password. Tools used to open the sign-in form here, with no sign-out (manual test, 18 Nov 2026).
 */
export function AccountPanel() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchSignedInUser()
      .then((user) => {
        if (!active) return;
        if (!user) {
          router.replace("/auth?form=1");
          return;
        }
        setEmail(user.email ?? null);
      })
      .catch(() => {
        if (active) setEmail(null);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const signOut = async () => {
    setBusy(true);
    await lockAccountVault();
    await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" }).catch(() => null);
    router.push("/auth");
    router.refresh();
  };

  const sendPasswordLink = async () => {
    if (!email) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/auth/password-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(
        response.ok
          ? "Check your email. Open the link there to choose a new password."
          : "The email could not be sent. Try again in a minute."
      );
    } catch {
      setStatus("The email could not be sent. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="account-panel">
      <section className={ui.cardPad}>
        <p className="text-xs font-medium text-muted">Signed in as</p>
        <p className="mt-1 break-all font-medium text-heading" data-testid="account-email">
          {email === undefined ? "…" : email ?? "Your account"}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" className={ui.primary} onClick={() => void signOut()} disabled={busy} data-testid="account-sign-out">
            Sign out
          </button>
          <button
            type="button"
            className={ui.secondary}
            onClick={() => void sendPasswordLink()}
            disabled={busy || !email}
            data-testid="account-password-link"
          >
            Email me a link to change my password
          </button>
        </div>
        {status ? (
          <p className="mt-3 text-sm text-muted" role="status">
            {status}
          </p>
        ) : null}
      </section>
      <section className={ui.cardPad}>
        <p className="font-medium text-heading">Privacy</p>
        <p className="mt-1 text-sm text-muted">
          What we keep and your rights: <Link href="/privacy" className="underline">privacy notice</Link>. A copy of your
          study data any time: <Link href="/me/data" className="underline">download my study data</Link>.
        </p>
      </section>
    </div>
  );
}
