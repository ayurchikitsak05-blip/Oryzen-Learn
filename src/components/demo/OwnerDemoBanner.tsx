"use client";

import React, { useEffect, useState } from "react";
import {
  OWNER_DEMO_EMAIL,
  allowsLocalOwnerDemoBypass,
  isOwnerDemoEmail,
} from "@/lib/demo/owner-demo";
import { fetchSignedInUser } from "@/lib/supabase/session";

export default function OwnerDemoBanner() {
  const [visible, setVisible] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hostname = window.location.hostname;
      const cookieValue = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("oryzen_owner_demo="))
        ?.split("=")[1];
      const localDemo = allowsLocalOwnerDemoBypass({
        hostname,
        vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
        cookieValue,
      });
      if (localDemo) {
        setLocalOnly(true);
        setVisible(true);
        return;
      }
      void fetchSignedInUser().then((user) => {
        setVisible(isOwnerDemoEmail(user?.email));
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      data-testid="owner-demo-banner"
      role="status"
      className="shrink-0 border-b border-line bg-beige-2 px-3 py-1 text-center text-[11px] leading-snug text-heading md:px-6"
    >
      {localOnly
        ? "LOCAL OWNER DEMO MODE — labeled local fallback only. This does not bypass Production security."
        : `OWNER DEMO ACCOUNT — throwaway isolated login ${OWNER_DEMO_EMAIL}. Not a real student.`}
    </div>
  );
}
