"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/components/ui/classes";
import { ensureAccountVault } from "@/lib/privacy/account-vault";
import { seedDemoWorkspace } from "@/lib/demo/seed-demo-workspace";

export default function TryDemoButton({
  className = "",
  label = "Try Demo",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={className}>
      <button
        type="button"
        data-testid="try-demo"
        disabled={busy}
        className={`${ui.secondary} min-h-[52px] w-full text-base`}
        onClick={() => {
          setBusy(true);
          setError(null);
          void (async () => {
            try {
              const response = await fetch("/api/auth/demo-start", {
                method: "POST",
                credentials: "same-origin",
              });
              const json = (await response.json()) as {
                next?: string;
                visitorId?: string;
                error?: string;
              };
              if (!response.ok || !json.visitorId) {
                setError(json.error ?? "The demo could not be opened on this deployment.");
                setBusy(false);
                return;
              }
              const opened = await ensureAccountVault().catch(() => false);
              if (opened) seedDemoWorkspace(json.visitorId);
              router.replace(json.next ?? "/hub");
              router.refresh();
            } catch {
              setError("The demo could not be opened on this deployment.");
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "Opening demo..." : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
