"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  confirmLeaveIfNeeded,
  recordAppVisit,
  resolveAppBack,
} from "@/lib/navigation/app-back";

export default function AppBackButton({
  className = "",
}: {
  className?: string;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [href, setHref] = useState("/hub");
  const [useHistory, setUseHistory] = useState(false);

  useEffect(() => {
    const path = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    recordAppVisit(path);
    const next = resolveAppBack(path);
    setVisible(next.visible);
    setHref(next.href);
    setUseHistory(next.useHistory);
  }, [pathname]);

  if (!visible) return null;

  return (
    <button
      type="button"
      data-testid="app-back"
      aria-label="Back"
      className={`inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-xl px-2.5 text-sm text-muted hover:bg-beige-2 hover:text-heading ${className}`}
      onClick={() => {
        if (!confirmLeaveIfNeeded()) return;
        if (useHistory && typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(href);
      }}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      Back
    </button>
  );
}
