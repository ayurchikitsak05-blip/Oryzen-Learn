import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import StudyDataDownload from "@/components/privacy/StudyDataDownload";

export default function StudyDataPage() {
  return (
    <AppChrome subtitle="Your data">
      <StudyDataDownload />
    </AppChrome>
  );
}
