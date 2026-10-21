"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";

export default function MinimalistStudyStudioDashboard() {
  return (
    <AppChrome
      nav="marketing"
      subtitle="Your personal learning environment"
      maxWidthClass="max-w-3xl"
      actions={<AccountMenu />}
    >
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center md:px-8">
        <p className={ui.eyebrow}>Oryzen Learn</p>
        <h1 className={`${ui.heading} mt-4 text-4xl sm:text-5xl`}>
          Your learning space, your way.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          Read, watch, explore, and organize everything you learn—all in one place.
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col items-stretch gap-3">
          <Link href="/hub" className={`${ui.primary} min-h-[52px] text-base`}>
            Go to My Learning Space
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/body-type" className={`${ui.secondary} min-h-[52px] text-base`}>
            Explore My Learning Profile
          </Link>
        </div>
      </main>
    </AppChrome>
  );
}
