"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { RecordLecture } from "@/components/video/RecordLecture";

export default function RecordLecturePage() {
  return (
    <AppChrome subtitle="Record a lecture">
      <RecordLecture />
    </AppChrome>
  );
}
