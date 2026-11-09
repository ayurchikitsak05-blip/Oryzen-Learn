"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { PhotoToNotes } from "@/components/photo/PhotoToNotes";

export default function PhotoNotesPage() {
  return (
    <AppChrome subtitle="Photo to notes">
      <PhotoToNotes />
    </AppChrome>
  );
}
