"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, BookOpen, House, PenLine, UserRound } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";

const APP_LINKS = [
  { href: "/hub", label: "Learning Space", icon: House },
  { href: "/reader", label: "Read", icon: BookOpen },
  { href: "/vaults", label: "Library", icon: Archive },
  { href: "/notes", label: "Notebook", icon: PenLine },
  { href: "/auth?form=1", label: "Account", icon: UserRound, match: "/auth" },
] as const;

function isActive(pathname: string, href: string, match?: string) {
  const target = match ?? href.split("?")[0];
  if (target === "/hub") return pathname === "/hub";
  return pathname === target || pathname.startsWith(`${target}/`);
}

export default function AppChrome({
  children,
  subtitle,
  actions,
  nav = "app",
  maxWidthClass = "max-w-6xl",
}: {
  children: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  nav?: "app" | "marketing";
  maxWidthClass?: string;
}) {
  const pathname = usePathname();
  const showAppNav = nav === "app";

  return (
    <div className={`min-h-screen bg-canvas text-ink ${showAppNav ? "pb-20 md:pb-0" : ""}`}>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/92 backdrop-blur-md">
        <div
          className={`mx-auto flex h-14 items-center justify-between gap-3 px-4 md:px-8 ${maxWidthClass}`}
        >
          <OryzenLearnBrand subtitle={subtitle} />
          {showAppNav ? (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {APP_LINKS.slice(0, 4).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex min-h-11 items-center rounded-xl px-3 text-sm ${
                    isActive(pathname, link.href)
                      ? "bg-selected text-heading"
                      : "text-muted hover:bg-beige-2 hover:text-heading"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <div className="flex min-w-0 items-center gap-1">{actions}</div>
        </div>
      </header>
      {children}
      {showAppNav ? (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="grid grid-cols-5">
            {APP_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(pathname, link.href, "match" in link ? link.match : undefined);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                      active ? "text-heading" : "text-muted"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
