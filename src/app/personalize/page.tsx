"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { PersonalizeSpace } from "@/components/experience/PersonalizeSpace";

export default function PersonalizePage() {
  return (
    <AppChrome subtitle="Personalize">
      <PersonalizeSpace />
    </AppChrome>
  );
}
