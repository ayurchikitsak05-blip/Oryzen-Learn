import React from "react";

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 160 88" aria-hidden="true" className="h-full w-full">
      <rect x="1" y="1" width="158" height="86" rx="16" fill="var(--beige-secondary, #E7EFE6)" />
      {children}
    </svg>
  );
}

export function BooksScene() {
  return (
    <Scene>
      <path d="M34 24h40c6 0 10 4 10 10v32H44c-6 0-10-3-10-8V24z" fill="var(--surface, #FFFDFB)" stroke="var(--heading)" strokeWidth="1.6" />
      <path d="M86 24h40v34c0 5-4 8-10 8H76V34c0-6 4-10 10-10z" fill="var(--selected, #E3EFE4)" stroke="var(--heading)" strokeWidth="1.6" />
      <path d="M46 36h24M46 44h20M96 36h20M96 44h16" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </Scene>
  );
}

export function VideoScene() {
  return (
    <Scene>
      <rect x="28" y="22" width="104" height="52" rx="10" fill="var(--surface, #FFFDFB)" stroke="var(--heading)" strokeWidth="1.6" />
      <path d="M74 36l22 12-22 12z" fill="var(--accent)" />
    </Scene>
  );
}

export function SprintScene() {
  return (
    <Scene>
      <circle cx="80" cy="46" r="24" fill="var(--surface, #FFFDFB)" stroke="var(--heading)" strokeWidth="1.6" />
      <path d="M80 32v16l10 6" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M80 18v6" stroke="var(--heading)" strokeWidth="1.6" strokeLinecap="round" />
    </Scene>
  );
}

export function PlannerScene() {
  return (
    <Scene>
      <rect x="36" y="22" width="88" height="50" rx="8" fill="var(--surface, #FFFDFB)" stroke="var(--heading)" strokeWidth="1.6" />
      <path d="M36 36h88" stroke="var(--heading)" strokeWidth="1.4" />
      <path d="M52 18v10M108 18v10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="58" cy="52" r="3" fill="var(--accent)" />
      <circle cx="80" cy="52" r="3" fill="var(--beige-primary, #D5E4D6)" stroke="var(--heading)" />
      <circle cx="102" cy="52" r="3" fill="var(--beige-primary, #D5E4D6)" stroke="var(--heading)" />
    </Scene>
  );
}

export function ProgressScene() {
  return (
    <Scene>
      <path d="M42 62V46M70 62V34M98 62V40M126 62V28" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" />
    </Scene>
  );
}

export function RevisionScene() {
  return (
    <Scene>
      <rect x="42" y="20" width="76" height="52" rx="8" fill="var(--surface, #FFFDFB)" stroke="var(--heading)" strokeWidth="1.6" />
      <path d="M54 36h28M54 48h36M54 60h20" stroke="var(--heading)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M96 50l6 6 12-14" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
    </Scene>
  );
}

export function NotebookScene() {
  return (
    <Scene>
      <path d="M46 18h62c6 0 10 4 10 10v42H56c-6 0-10-4-10-10V18z" fill="var(--surface, #FFFDFB)" stroke="var(--heading)" strokeWidth="1.6" />
      <path d="M58 34h40M58 44h34M58 54h28" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </Scene>
  );
}
