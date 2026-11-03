import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type LinkListItem = {
  href: string;
  title: string;
  detail: string;
  testId: string;
};

/** A plain list of large, tappable rows used by the Practice and Me tabs. */
export function LinkList({ items, label }: { items: readonly LinkListItem[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {items.map((item) => (
        <li key={item.testId}>
          <Link
            href={item.href}
            data-testid={item.testId}
            className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-beige-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-heading">{item.title}</span>
              <span className="block text-sm text-muted">{item.detail}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
