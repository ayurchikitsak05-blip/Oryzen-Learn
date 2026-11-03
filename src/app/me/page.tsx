import React from "react";
import AccountMenu from "@/components/auth/AccountMenu";
import AppChrome from "@/components/layout/AppChrome";
import { LinkList } from "@/components/layout/LinkList";
import { ME_ITEMS } from "@/lib/navigation/tabs";

export default function MePage() {
  return (
    <AppChrome subtitle="Me" showBack={false} actions={<AccountMenu />}>
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10">
        <h1 className="font-display text-3xl text-heading">Me</h1>
        <LinkList items={ME_ITEMS} label="Me" />
      </main>
    </AppChrome>
  );
}
