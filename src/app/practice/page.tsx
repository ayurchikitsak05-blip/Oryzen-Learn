import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { LinkList } from "@/components/layout/LinkList";
import { PRACTICE_ITEMS } from "@/lib/navigation/tabs";


export default function PracticePage() {
  return (
    <AppChrome subtitle="Practice" showBack={false}>
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10">
        <h1 className="font-display text-3xl text-heading">Practice</h1>
        <LinkList items={PRACTICE_ITEMS} label="Practice" />
      </main>
    </AppChrome>
  );
}
