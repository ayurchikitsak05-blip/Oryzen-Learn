export const ui = {
  page: "min-h-screen bg-canvas text-ink",
  main: "mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10",
  mainNarrow: "mx-auto w-full max-w-3xl px-4 py-10 md:px-8 md:py-14",
  card: "surface-card p-5 shadow-[0_10px_30px_-24px_rgba(32,36,43,0.35)]",
  cardPad: "surface-card p-6 shadow-[0_10px_30px_-24px_rgba(32,36,43,0.35)]",
  eyebrow:
    "text-[11px] font-medium uppercase tracking-[0.16em] text-muted",
  heading: "font-display text-heading tracking-tight",
  muted: "text-muted leading-relaxed",
  label: "mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted",
  input: "field-input text-sm",
  textarea: "field-input min-h-28 py-3 text-sm leading-relaxed",
  primary: "btn-primary text-sm",
  secondary: "btn-secondary text-sm",
  ghost: "btn-ghost text-sm",
  iconBtn:
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-accent hover:bg-beige-2",
  chip: "icon-chip",
  notice:
    "rounded-xl border border-line bg-beige-2 px-4 py-3 text-sm leading-relaxed text-ink",
  alert:
    "rounded-xl border border-danger/25 bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger",
  success:
    "rounded-xl border border-success/20 bg-success-bg px-4 py-3 text-sm leading-relaxed text-success",
  empty: "rounded-2xl border border-dashed border-line bg-canvas-2 px-4 py-8 text-sm text-muted",
  loading: "text-sm text-muted",
  backdrop:
    "fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--heading)_28%,transparent)] p-4 sm:items-center",
  modal:
    "surface-card max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-md overflow-y-auto p-6 shadow-[0_24px_60px_-28px_rgba(32,36,43,0.45)] [animation:oryzen-rise_180ms_ease]",
  selected: "border-beige bg-selected text-heading",
  idle: "border-line bg-surface text-ink hover:bg-beige-2",
} as const;

export function tabClass(active: boolean): string {
  return `inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-sm transition ${
    active ? ui.selected : "border-transparent text-muted hover:bg-beige-2 hover:text-heading"
  }`;
}

export function choiceClass(active: boolean): string {
  return `flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-relaxed transition-colors ${
    active ? ui.selected : ui.idle
  }`;
}
