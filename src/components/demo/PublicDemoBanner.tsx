"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { lockAccountVault, SEALED_PRIVATE_KEY } from "@/lib/privacy/account-vault";
import { EXPERIENCE_STORAGE_KEY } from "@/lib/experience/types";
import { ensureAccountVault } from "@/lib/privacy/account-vault";
import { seedDemoWorkspace } from "@/lib/demo/seed-demo-workspace";

export default function PublicDemoBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSignedInUser()
      .then((user) => {
        if (!cancelled) setVisible(Boolean(user?.demo));
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      data-testid="public-demo-banner"
      className="border-b border-line bg-beige-2 px-3 py-2 text-sm text-ink md:px-4"
      role="status"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          PUBLIC DEMO — fictional student workspace. Companions and AI replies stay simulated. This
          browser cannot open real student accounts.
        </p>
        <button
          type="button"
          data-testid="reset-demo"
          disabled={busy}
          className="btn-secondary min-h-11 shrink-0 text-xs"
          onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                await lockAccountVault();
                window.localStorage.removeItem(SEALED_PRIVATE_KEY);
                window.localStorage.removeItem(EXPERIENCE_STORAGE_KEY);
                const response = await fetch("/api/auth/demo-reset", {
                  method: "POST",
                  credentials: "same-origin",
                });
                const json = (await response.json()) as { visitorId?: string; next?: string };
                if (!response.ok || !json.visitorId) {
                  setBusy(false);
                  return;
                }
                const opened = await ensureAccountVault().catch(() => false);
                if (opened) seedDemoWorkspace(json.visitorId);
                router.replace(json.next ?? "/hub");
                router.refresh();
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Resetting..." : "Reset Demo"}
        </button>
      </div>
    </div>
  );
}
