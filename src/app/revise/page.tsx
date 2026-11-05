"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { MorningRevision } from "@/components/revision/MorningRevision";

export default function RevisePage() {
  return (
    <AppChrome subtitle="Revise">
      <MorningRevision />
    </AppChrome>
  );
}
