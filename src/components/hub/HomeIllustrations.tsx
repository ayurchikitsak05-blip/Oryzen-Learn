import React from "react";

const NAVY = "#1C2A32";
const TEAL = "#2F6B6A";
const SAGE = "#D7E6D8";
const CREAM = "#F7F4EE";
const GOLD = "#C4A36A";

export type HomeIconName =
  | "tutor"
  | "buddy"
  | "teacher"
  | "coach"
  | "guide"
  | "ebooks"
  | "video"
  | "sprint"
  | "planner"
  | "progress"
  | "revision"
  | "notebook";

function Glyph({ name, children }: { name: HomeIconName; children: React.ReactNode }) {
  return (
    <svg data-icon={name} viewBox="0 0 32 32" aria-hidden="true" className="h-8 w-8" fill="none">
      {children}
    </svg>
  );
}

const stroke = {
  stroke: NAVY,
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ name }: { name: HomeIconName }) {
  if (name === "tutor") {
    return (
      <Glyph name={name}>
        <circle cx="16" cy="9" r="3.25" fill={CREAM} {...stroke} />
        <path d="M8.5 24.5c1.2-4.6 4-7 7.5-7s6.3 2.4 7.5 7" {...stroke} />
        <path d="M20 16.5h6.5a1 1 0 0 1 1 1V23a1 1 0 0 1-1 1H20v-7.5z" fill={SAGE} {...stroke} />
        <path d="M20 16.5c1.6 1.2 3.2 1.2 5 0" stroke={TEAL} strokeWidth="1.5" fill="none" />
      </Glyph>
    );
  }
  if (name === "buddy") {
    return (
      <Glyph name={name}>
        <rect x="4" y="5" width="16" height="12" rx="6" fill={CREAM} {...stroke} />
        <circle cx="9" cy="11" r="1" fill={TEAL} />
        <circle cx="12" cy="11" r="1" fill={TEAL} />
        <circle cx="15" cy="11" r="1" fill={TEAL} />
        <rect x="12" y="15" width="16" height="11" rx="5.5" fill={SAGE} {...stroke} />
      </Glyph>
    );
  }
  if (name === "teacher") {
    return (
      <Glyph name={name}>
        <rect x="5" y="5" width="22" height="14" rx="2.5" fill={CREAM} {...stroke} />
        <path d="M9 10h9M9 14h6" stroke={TEAL} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M8 23.5h9.5c.8 0 1.5.7 1.5 1.5v1H9.2c-.7 0-1.2-.5-1.2-1.2v-1.3z" fill={SAGE} {...stroke} />
        <path d="M19 23.5h5.2c.8 0 1.3.6 1.3 1.3V26h-8v-1.2c0-.8.6-1.3 1.5-1.3z" fill={CREAM} {...stroke} />
      </Glyph>
    );
  }
  if (name === "coach") {
    return (
      <Glyph name={name}>
        <circle cx="16" cy="16" r="10" fill={CREAM} {...stroke} />
        <circle cx="16" cy="16" r="6" fill={SAGE} {...stroke} />
        <circle cx="16" cy="16" r="2.1" fill={TEAL} />
        <path d="M16 6a10 10 0 0 1 9.2 6.2" stroke={GOLD} strokeWidth="2.25" strokeLinecap="round" fill="none" />
      </Glyph>
    );
  }
  if (name === "guide") {
    return (
      <Glyph name={name}>
        <circle cx="16" cy="16" r="10" fill={CREAM} {...stroke} />
        <path d="M16 7v2.2M16 22.8V25M7 16h2.2M22.8 16H25" stroke={NAVY} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16 9.5 18.4 16 16 22.5 13.6 16z" fill={SAGE} stroke={NAVY} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M16 9.5 18.4 16 16 16z" fill={TEAL} />
        <path d="M16 22.5 13.6 16 16 16z" fill={GOLD} />
      </Glyph>
    );
  }
  if (name === "ebooks") {
    return (
      <Glyph name={name}>
        <path d="M7 9.5c0-.8.7-1.5 1.6-1.5H15v16H8.8c-1 0-1.8-.7-1.8-1.6V9.5z" fill={SAGE} {...stroke} />
        <path d="M17 8h6.4c.9 0 1.6.7 1.6 1.5v12.9c0 .9-.8 1.6-1.8 1.6H17V8z" fill={CREAM} {...stroke} />
        <path d="M16 8v16" stroke={NAVY} strokeWidth="1.75" />
        <path d="M9.5 13h4M9.5 16.5h3.2M19 13h3.5M19 16.5h3" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" />
      </Glyph>
    );
  }
  if (name === "video") {
    return (
      <Glyph name={name}>
        <rect x="4.5" y="7.5" width="23" height="17" rx="3" fill={CREAM} {...stroke} />
        <path d="M14 12.2 20.2 16 14 19.8z" fill={TEAL} />
      </Glyph>
    );
  }
  if (name === "sprint") {
    return (
      <Glyph name={name}>
        <rect x="13.2" y="4.5" width="5.6" height="3.2" rx="1.2" fill={SAGE} {...stroke} />
        <circle cx="16" cy="18" r="8.5" fill={CREAM} {...stroke} />
        <path d="M16 18V13.2" stroke={TEAL} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M16 18h4" stroke={GOLD} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M12.2 6.2 10.5 8.2M19.8 6.2 21.5 8.2" stroke={NAVY} strokeWidth="1.5" strokeLinecap="round" />
      </Glyph>
    );
  }
  if (name === "planner") {
    return (
      <Glyph name={name}>
        <rect x="6" y="7.5" width="20" height="17.5" rx="2.5" fill={CREAM} {...stroke} />
        <path d="M6 13h20" stroke={NAVY} strokeWidth="1.75" />
        <path d="M11 5.5v4M21 5.5v4" stroke={TEAL} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M11 20.2 13.2 22.2 17.5 17.5" stroke={GOLD} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </Glyph>
    );
  }
  if (name === "progress") {
    return (
      <Glyph name={name}>
        <path d="M6 25h20" stroke={NAVY} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M8 20.5 13.5 16 18 17.5 25 9.5" stroke={TEAL} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8" cy="20.5" r="1.6" fill={NAVY} />
        <circle cx="13.5" cy="16" r="1.6" fill={NAVY} />
        <circle cx="18" cy="17.5" r="1.6" fill={NAVY} />
        <circle cx="25" cy="9.5" r="2" fill={GOLD} />
      </Glyph>
    );
  }
  if (name === "revision") {
    return (
      <Glyph name={name}>
        <rect x="6" y="7" width="4.2" height="4.2" rx="1" fill={CREAM} {...stroke} />
        <rect x="6" y="14" width="4.2" height="4.2" rx="1" fill={SAGE} {...stroke} />
        <rect x="6" y="21" width="4.2" height="4.2" rx="1" fill={CREAM} {...stroke} />
        <path d="M7.1 16.2 8.2 17.4 10 15.2" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 9.1h6.5M13 16.1h5.2M13 23.1h4.2" stroke={NAVY} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M20.6 18.4 24.7 14.3 26.5 16.1 22.4 20.2z" fill={CREAM} {...stroke} />
        <path d="M24.1 13.7 25.8 12" stroke={GOLD} strokeWidth="1.75" strokeLinecap="round" />
      </Glyph>
    );
  }
  return (
    <Glyph name="notebook">
      <path d="M9 6.5h13.5c1 0 1.8.8 1.8 1.8V25c0 1-.8 1.8-1.8 1.8H9V6.5z" fill={CREAM} {...stroke} />
      <path d="M9 6.5v20.3" stroke={NAVY} strokeWidth="1.75" />
      <path d="M7.2 9.5h3.2M7.2 14h3.2M7.2 18.5h3.2M7.2 23h3.2" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.5 12h7M13.5 16h6.2M13.5 20h5" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
    </Glyph>
  );
}
