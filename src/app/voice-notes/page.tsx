"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { VoiceNotes } from "@/components/voice/VoiceNotes";

export default function VoiceNotesPage() {
  return (
    <AppChrome subtitle="Voice notes">
      <VoiceNotes />
    </AppChrome>
  );
}
