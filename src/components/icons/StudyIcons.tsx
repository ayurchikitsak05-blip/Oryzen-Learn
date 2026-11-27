"use client";

import React from "react";

/**
 * Study icons (owner approved, Nov 2026): duotone line drawings that draw themselves in,
 * then keep a small motion of their own. Styles live in globals.css (.ic). Motion stops
 * for students who turn animations off.
 */
export type StudyIconName = "lectures" | "books" | "revision" | "timer" | "style" | "plane" | "sun" | "sprout";

export const STUDY_ICON_TONE: Record<StudyIconName, "peach" | "butter" | "sky" | "mint" | "lilac"> = {lectures: "peach", books: "butter", revision: "sky", timer: "mint", style: "lilac", plane: "peach", sun: "butter", sprout: "mint"};

const TONES = {peach: { from: "#f6efe8", to: "#ecdfd3", ink: "#94664f" }, butter: { from: "#f6f1e6", to: "#ebe2cc", ink: "#806b45" }, sky: { from: "#eff1f2", to: "#dfe4e7", ink: "#5b6c7a" }, mint: { from: "#eff1ec", to: "#dfe5db", ink: "#58705e" }, lilac: { from: "#f2eff2", to: "#e4dfe6", ink: "#6e6276" }} as const;

function Body({ name }: { name: StudyIconName }) {
  switch (name) {
    case "lectures":
      return (<><rect className="f" x="2.5" y="4.5" width="19" height="13" rx="3" fill="currentColor" fillOpacity=".14" stroke="none" /><rect className="d" x="2.5" y="4.5" width="19" height="13" rx="3" pathLength={1} /><path className="d" d="M8.5 21h7M12 17.5V21" pathLength={1} /><path className="ic-play" d="M10.5 8.3v4.4l3.8-2.2z" fill="currentColor" strokeWidth="1.2" /><path d="M5.5 15h13" strokeOpacity=".2" /><path className="ic-progress" d="M5.5 15h13" /></>);
    case "books":
      return (<><path className="f" d="M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5z" fill="currentColor" fillOpacity=".16" stroke="none" /><path className="d" d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5" pathLength={1} /><path className="d" d="M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5" pathLength={1} /><path className="d" d="M12 6.5v13" pathLength={1} /><path className="d" d="M6.2 9.2h3M6.2 12.2h3" pathLength={1} /><path className="ic-page" d="M12 6.5c1.6-1.1 3.7-1.6 6.2-1.5v12.6c-2.5-.1-4.6.4-6.2 1.5z" fill="#fffdfb" fillOpacity=".9" /></>);
    case "revision":
      return (<><rect className="f" x="7" y="3.5" width="13.5" height="10" rx="2.5" fill="currentColor" fillOpacity=".18" stroke="none" /><rect className="d" x="7" y="3.5" width="13.5" height="10" rx="2.5" pathLength={1} /><g className="ic-flip"><rect x="3.5" y="8.5" width="14" height="11.5" rx="2.5" fill="#fffdfb" stroke="none" /><rect className="d" x="3.5" y="8.5" width="14" height="11.5" rx="2.5" pathLength={1} /><path className="ic-check" d="M7.3 14.3l2.2 2.2 4.2-4.3" pathLength={1} strokeWidth="1.8" /></g></>);
    case "timer":
      return (<><circle className="f" cx="12" cy="13.5" r="7.5" fill="currentColor" fillOpacity=".14" stroke="none" /><circle className="d" cx="12" cy="13.5" r="7.5" pathLength={1} /><circle className="ic-arc" cx="12" cy="13.5" r="5.2" pathLength={1} strokeWidth="2.4" strokeOpacity=".35" transform="rotate(-90 12 13.5)" /><path className="d" d="M10 2.8h4M12 2.8V6M18.3 6.6l1.4-1.4" pathLength={1} /><path className="ic-hand" d="M12 13.5V9.2" strokeWidth="1.9" /><circle cx="12" cy="13.5" r="1.1" fill="currentColor" stroke="none" /></>);
    case "style":
      return (<><path className="f" d="M7 15h10l-1.2 5.5H8.2z" fill="currentColor" fillOpacity=".18" stroke="none" /><path className="d" d="M7 15h10l-1.2 5.5H8.2z" pathLength={1} /><path className="d" d="M12 15V9.5" pathLength={1} /><path className="ic-leaf-r" d="M12 11.2c0-3 2-5 5-5 0 3-2 5-5 5z" fill="currentColor" fillOpacity=".22" /><path className="ic-leaf-l" d="M12 12.6c0-2.4-1.6-4-4-4 0 2.4 1.6 4 4 4z" fill="currentColor" fillOpacity=".22" /><path className="ic-spark" d="M19 2.5v3M17.5 4h3" strokeWidth="1.4" /></>);
    case "plane":
      return (<><path className="ic-trail" d="M2.5 21c2.5-.6 4.2-.2 6.2-1.8" /><g className="ic-plane"><path className="f" d="M21.5 2.5L2.8 10.2l7.2 2.8 2.9 7.3z" fill="currentColor" fillOpacity=".16" stroke="none" /><path className="d" d="M21.5 2.5L2.8 10.2l7.2 2.8 2.9 7.3z" pathLength={1} /><path className="d" d="M21.5 2.5L10 13" pathLength={1} /></g></>);
    case "sun":
      return (<><g className="ic-rise"><circle className="ic-glow" cx="12" cy="12" r="5" fill="currentColor" stroke="none" /><circle className="f" cx="12" cy="12" r="4.2" fill="currentColor" fillOpacity=".2" stroke="none" /><circle className="d" cx="12" cy="12" r="4.2" pathLength={1} /><g className="ic-rays"><path className="d" d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" pathLength={1} /></g></g></>);
    case "sprout":
      return (<><path className="f" d="M12 12c-2-1.5-5-2-8.5-1.5v9c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5v-9C17 10 14 10.5 12 12z" fill="currentColor" fillOpacity=".16" stroke="none" /><path className="d" d="M12 12c-2-1.5-5-2-8.5-1.5v9c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5v-9C17 10 14 10.5 12 12z" pathLength={1} /><path className="d" d="M12 12v9" pathLength={1} /><path className="ic-stem" d="M12 12V6.5" pathLength={1} /><g className="ic-bud"><g className="ic-leaf-r" style={{"--d":".6s"} as React.CSSProperties}><path d="M12 8c0-2.6 1.7-4.3 4.3-4.3 0 2.6-1.7 4.3-4.3 4.3z" fill="currentColor" fillOpacity=".25" /></g><g className="ic-leaf-l" style={{"--d":".6s"} as React.CSSProperties}><path d="M12 9.2c0-2-1.4-3.4-3.4-3.4 0 2 1.4 3.4 3.4 3.4z" fill="currentColor" fillOpacity=".25" /></g></g></>);
  }
}

export function StudyIcon({ name, size = 26, delay = 0.2 }: { name: StudyIconName; size?: number; delay?: number }) {
  const tone = TONES[STUDY_ICON_TONE[name]];
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: tone.ink, "--d": `${delay}s` } as React.CSSProperties}>
      <Body name={name} />
    </svg>
  );
}

/** The soft tile an icon sits on. */
export function StudyIconTile({ name, box = 44, size, radius = 13, delay }: { name: StudyIconName; box?: number; size?: number; radius?: number; delay?: number }) {
  const tone = TONES[STUDY_ICON_TONE[name]];
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: box, height: box, borderRadius: radius, background: `linear-gradient(150deg, ${tone.from}, ${tone.to})`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.7)" }}>
      <StudyIcon name={name} size={size ?? Math.round(box * 0.58)} delay={delay} />
    </span>
  );
}
