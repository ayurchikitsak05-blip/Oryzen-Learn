import React from "react";
import AppChrome from "@/components/layout/AppChrome";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <AppChrome subtitle="Studio">{children}</AppChrome>;
}
