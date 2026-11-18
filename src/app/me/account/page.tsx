"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { AccountPanel } from "@/components/auth/AccountPanel";
import { ui } from "@/components/ui/classes";

export default function AccountPage() {
  return (
    <AppChrome subtitle="Account and privacy">
      <main className={ui.mainNarrow}>
        <h1 className="font-display text-2xl text-heading">Account and privacy</h1>
        <div className="mt-6">
          <AccountPanel />
        </div>
      </main>
    </AppChrome>
  );
}
