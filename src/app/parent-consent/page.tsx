"use client";

import React, { Suspense } from "react";
import AppChrome from "@/components/layout/AppChrome";
import { ParentConsentWaiting } from "@/components/consent/ConsentScreens";

export default function Page() {
  return (
    <AppChrome subtitle="Parent consent" nav="marketing" showBack={false}>
      <Suspense fallback={null}>
        <ParentConsentWaiting />
      </Suspense>
    </AppChrome>
  );
}
