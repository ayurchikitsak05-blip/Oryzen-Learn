"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const itemClass =
  "inline-flex min-h-[44px] items-center rounded-full border border-amber-500/40 bg-amber-950/40 px-4 text-sm font-medium text-amber-100 hover:bg-amber-950/70";

export default function AccountMenu() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1">
      <Link href="/auth?form=1" className={itemClass}>
        Sign in
      </Link>
      <button type="button" onClick={() => void signOut()} className={itemClass}>
        Sign out
      </button>
    </div>
  );
}
