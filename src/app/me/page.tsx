import React from "react";
import AccountMenu from "@/components/auth/AccountMenu";
import AppChrome from "@/components/layout/AppChrome";
import { LinkList } from "@/components/layout/LinkList";
import { ME_HIGHLIGHTS, ME_ITEMS, SETTINGS_ITEMS } from "@/lib/navigation/tabs";

export default function MePage() {
  return (
    <AppChrome subtitle="Tools" showBack={false} actions={<AccountMenu />}>
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10">
        <h1 className="font-display text-3xl text-heading">Study tools</h1>
        <section aria-labelledby="me-highlights" className="space-y-2">
          <h2 id="me-highlights" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Highlights
          </h2>
          <LinkList items={ME_HIGHLIGHTS} label="Highlights" />
        </section>
        <section aria-labelledby="me-more" className="space-y-2">
          <h2 id="me-more" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Plan and notes
          </h2>
          <LinkList items={ME_ITEMS} label="Plan and notes" />
        </section>
        <section aria-labelledby="me-settings" className="space-y-2">
          <h2 id="me-settings" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Settings
          </h2>
          <LinkList items={SETTINGS_ITEMS} label="Settings" />
        </section>
      </main>
    </AppChrome>
  );
}
