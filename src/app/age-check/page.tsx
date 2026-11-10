"use client";

import React, { Suspense } from "react";
import AppChrome from "@/components/layout/AppChrome";
import { AgeCheck } from "@/components/consent/ConsentScreens";

export default function Page() {
  return (
    <AppChrome subtitle="Your age" nav="marketing" showBack={false}>
      <Suspense fallback={null}>
        <AgeCheck />
      </Suspense>
    </AppChrome>
  );
}
