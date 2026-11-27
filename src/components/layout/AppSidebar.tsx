"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Image from "next/image";
import { SIDEBAR_FOOTER, SIDEBAR_GROUPS } from "@/lib/navigation/tabs";

export const SIDEBAR_COLLAPSED_KEY = "oryzen_sidebar_collapsed_v1";

const GROUP_DOT: Record<string, string> = {
  study: "bg-accent",
  practice: "bg-[#5b6c7a]",
  plan: "bg-[#58705e]",
};

export function sidebarActive(pathname: string, href: string): boolean {
  if (href === "/hub") return pathname === "/hub";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop left menu (large screens only); phones use the bottom tabs. */
export default function AppSidebar({ pathname }: { pathname: string }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* private window: stays open */
    }
  }, []);
  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* private window */
      }
      return next;
    });
  };
  const FooterIcon = SIDEBAR_FOOTER.icon;

  return (
    <aside
      data-testid="app-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={`hidden shrink-0 flex-col border-r border-line bg-[var(--bg-secondary,var(--bg))] lg:flex ${collapsed ? "w-[76px]" : "w-60"}`}
    >
      <div className={`flex min-h-14 items-center border-b border-line ${collapsed ? "justify-center px-2" : "px-4"}`}>
        {/* Not a link: the header keeps the one home link. */}
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-[#FFFDFC] p-0.5">
            <Image src="/logo.png" alt="" width={36} height={36} className="h-full w-full object-contain" />
          </span>
          {collapsed ? null : <span className="whitespace-nowrap font-display text-base text-heading">Oryzen Learn</span>}
        </span>
      </div>
      <nav aria-label="Main menu" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            <p
              className={`mt-3 flex items-center gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted first:mt-0 ${collapsed ? "justify-center" : ""}`}
            >
              <span className={`inline-block h-0.5 w-3 rounded ${GROUP_DOT[group.id] ?? "bg-accent"}`} aria-hidden="true" />
              {collapsed ? <span className="sr-only">{group.label}</span> : group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = sidebarActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                    collapsed ? "justify-center" : ""
                  } ${active ? "bg-selected font-semibold text-heading" : "text-muted hover:bg-beige-2 hover:text-heading"}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className={`flex items-center gap-1 border-t border-line p-3 ${collapsed ? "flex-col" : ""}`}>
        <Link
          href={SIDEBAR_FOOTER.href}
          title={collapsed ? SIDEBAR_FOOTER.label : undefined}
          aria-current={sidebarActive(pathname, SIDEBAR_FOOTER.href) ? "page" : undefined}
          className={`flex min-h-10 flex-1 items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-beige-2 hover:text-heading ${collapsed ? "justify-center" : ""}`}
        >
          <FooterIcon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          {collapsed ? <span className="sr-only">{SIDEBAR_FOOTER.label}</span> : <span className="truncate">{SIDEBAR_FOOTER.label}</span>}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Open the menu" : "Make the menu narrow"}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-beige-2 hover:text-heading"
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}
