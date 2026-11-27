import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { LinkList } from "@/components/layout/LinkList";
import { PRACTICE_ITEMS } from "@/lib/navigation/tabs";
import { PageTitle } from "@/components/layout/PageTitle";


export default function PracticePage() {
  return (
    <AppChrome subtitle="Practice" showBack={false}>
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10">
        <PageTitle kicker="Practice zone" title="Practice" subtitle="Quick checks, revision and focus, all from your own books and notes." />
        <LinkList items={PRACTICE_ITEMS} label="Practice" />
      </main>
    </AppChrome>
  );
}
