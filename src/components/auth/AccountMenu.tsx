"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ui } from "@/components/ui/classes";
import { lockAccountVault } from "@/lib/privacy/account-vault";
import { fetchSignedInUser } from "@/lib/supabase/session";

export default function AccountMenu() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSignedInUser().then((user) => setSignedIn(Boolean(user)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const signOut = async () => {
    await lockAccountVault();
    await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "same-origin",
    });
    setSignedIn(false);
    router.push("/auth");
    router.refresh();
  };

  if (signedIn === null) {
    return <div className="min-h-11 min-w-11" aria-hidden="true" />;
  }

  if (!signedIn) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/personalize" className={ui.ghost}>
          Personalize
        </Link>
        <Link href="/auth?form=1" className={ui.secondary}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link href="/personalize" className={ui.ghost}>
        Personalize
      </Link>
      <button type="button" onClick={() => void signOut()} className={ui.ghost}>
        Sign out
      </button>
    </div>
  );
}
