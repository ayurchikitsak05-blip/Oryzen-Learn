"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, BookOpen, ChartColumn, House, PenLine, UserRound } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import OwnerDemoBanner from "@/components/demo/OwnerDemoBanner";
import PublicDemoBanner from "@/components/demo/PublicDemoBanner";
import { CompanionBubble } from "@/components/experience/CompanionBubble";
import AppBackButton from "@/components/layout/AppBackButton";
import { ensureAccountVault } from "@/lib/privacy/account-vault";

const APP_LINKS = [
  { href: "/hub", label: "Learning Space", mobileLabel: "Home", icon: House },
  { href: "/reader", label: "Read", icon: BookOpen },
  { href: "/progress", label: "Progress", icon: ChartColumn },
  { href: "/vaults", label: "Library", icon: Archive },
  { href: "/notes", label: "Notebook", mobileLabel: "Notes", icon: PenLine },
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
  showBack = true,
}: {
  children: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  nav?: "app" | "marketing";
  maxWidthClass?: string;
  /** When false, the shared Back control is omitted (page already has equivalent navigation). */
  showBack?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [navReady, setNavReady] = useState(false);
  const navPath = navReady ? pathname : "";
  const showAppNav = nav === "app";

  useEffect(() => {
    setNavReady(true);
  }, []);

  useEffect(() => {
    if (!showAppNav) return;
    void ensureAccountVault();
  }, [showAppNav]);

  return (
    <div className={`flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas text-ink ${showAppNav ? "pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
      <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-canvas/92 backdrop-blur-md">
        <div
          className={`mx-auto flex min-h-12 w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1 md:flex-nowrap md:px-4 lg:gap-2 lg:px-6 ${maxWidthClass}`}
        >
          <OryzenLearnBrand subtitle={subtitle} />
          {showAppNav ? (
            <nav className="hidden items-center md:flex" aria-label="Primary">
              {APP_LINKS.filter((link) => link.href !== "/auth?form=1").map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-xl px-1 text-[13px] lg:px-3 lg:text-sm ${
                    isActive(navPath, link.href)
                      ? "bg-selected text-heading"
                      : "text-muted hover:bg-beige-2 hover:text-heading"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1">{actions}</div>
        </div>
      </header>
      {showAppNav ? <PublicDemoBanner /> : null}
      {showAppNav ? <OwnerDemoBanner /> : null}
      {showAppNav && showBack ? (
        <div className={`mx-auto flex w-full min-w-0 shrink-0 items-center px-3 pt-2 md:px-4 lg:px-6 ${maxWidthClass}`}>
          <AppBackButton />
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</div>
      {showAppNav ? <CompanionBubble /> : null}
      {showAppNav ? (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="grid grid-cols-6">
            {APP_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(navPath, link.href, "match" in link ? link.match : undefined);
              const mobileLabel = "mobileLabel" in link ? link.mobileLabel : link.label;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] leading-tight ${
                      active ? "text-heading" : "text-muted"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {mobileLabel}
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
