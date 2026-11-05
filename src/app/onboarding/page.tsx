"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { StudyStyleQuiz } from "@/components/study/StudyStyleQuiz";

/** My study style: 27 questions about you (classical body-type traits) and 12 about how you study. */
export default function StudyStylePage() {
  return (
    <AppChrome subtitle="My study style">
      <StudyStyleQuiz />
    </AppChrome>
  );
}
