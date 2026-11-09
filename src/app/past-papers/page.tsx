"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { PastPapers } from "@/components/pyq/PastPapers";

export default function PastPapersPage() {
  return (
    <AppChrome subtitle="Past papers">
      <PastPapers />
    </AppChrome>
  );
}
