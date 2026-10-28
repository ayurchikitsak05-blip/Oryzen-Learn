"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { SprintStudio } from "@/components/sprint/SprintStudio";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";

export default function SprintPage() {
  const userId = useSignedInScope();
  return (
    <AppChrome subtitle="Study Sprint">
      <main className={ui.main}>
        <SprintStudio userId={userId} />
      </main>
    </AppChrome>
  );
}
