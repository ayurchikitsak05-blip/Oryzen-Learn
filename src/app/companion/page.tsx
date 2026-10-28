"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppChrome from "@/components/layout/AppChrome";
import { CompanionChat } from "@/components/companion/CompanionChat";
import { COMPANION_STYLES, type CompanionStyle } from "@/lib/companion";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";

export default function CompanionPage() {
  return (
    <Suspense fallback={null}>
      <CompanionPageBody />
    </Suspense>
  );
}

function CompanionPageBody() {
  const userId = useSignedInScope();
  const params = useSearchParams();
  const fromOnboarding = params.get("from") === "onboarding";
  const requested = params.get("style");
  const initialStyle = COMPANION_STYLES.includes(requested as CompanionStyle)
    ? (requested as CompanionStyle)
    : null;
  return (
    <AppChrome subtitle="Take My Study">
      <main className={ui.mainNarrow}>
        <CompanionChat userId={userId} fromOnboarding={fromOnboarding} initialStyle={initialStyle} />
      </main>
    </AppChrome>
  );
}
