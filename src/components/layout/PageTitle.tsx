import React from "react";

/**
 * The same title on every main page (owner, 27 Nov 2026): a short accent line, an icon,
 * the title, a small label and one line saying what the page is for.
 */
export function PageTitle({
  icon,
  kicker,
  title,
  subtitle,
  aside,
}: {
  icon?: React.ReactNode;
  kicker?: string;
  title: string;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <span className="block h-[3px] w-7 rounded-full bg-accent" aria-hidden="true" />
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{kicker}</p>
        ) : null}
        <h1 className="font-display flex items-center gap-2.5 text-3xl leading-tight text-heading">
          {icon ? <span className="inline-flex shrink-0 text-accent">{icon}</span> : null}
          <span className="min-w-0">{title}</span>
        </h1>
        {subtitle ? <p className="text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}
