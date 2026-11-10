import type { Metadata } from "next";
import type { ReactNode } from "react";

/** The consent link carries a secret: never send it to other sites as the referrer. */
export const metadata: Metadata = { title: "Parent consent · ORYZEN Learn", referrer: "no-referrer" };

export default function ParentLayout({ children }: { children: ReactNode }) {
  return children;
}
