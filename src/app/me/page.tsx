import React from "react";
import AccountMenu from "@/components/auth/AccountMenu";
import AppChrome from "@/components/layout/AppChrome";
import { LinkList } from "@/components/layout/LinkList";
import { ME_HIGHLIGHTS, ME_ITEMS } from "@/lib/navigation/tabs";

export default function MePage() {
  return (
    <AppChrome subtitle="Me" showBack={false} actions={<AccountMenu />}>
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10">
        <h1 className="font-display text-3xl text-heading">Me</h1>
        <section aria-labelledby="me-highlights" className="space-y-2">
          <h2 id="me-highlights" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Highlights
          </h2>
          <LinkList items={ME_HIGHLIGHTS} label="Highlights" />
        </section>
        <section aria-labelledby="me-more" className="space-y-2">
          <h2 id="me-more" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            More
          </h2>
          <LinkList items={ME_ITEMS} label="Me" />
        </section>
      </main>
    </AppChrome>
  );
}
