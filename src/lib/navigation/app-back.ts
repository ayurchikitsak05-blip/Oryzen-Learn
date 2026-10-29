/**
 * In-app Back targets stay inside ORYZEN Learn. Auth, pricing, and
 * external URLs are never treated as a safe previous page.
 */

export const APP_NAV_STACK_KEY = "oryzen_app_nav_stack_v1";

const BLOCKED_PREFIXES = [
  "/auth",
  "/api",
  "/pricing",
  "/checkout",
  "/access",
  "/onboarding",
] as const;

export function normalizeAppPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      return `${url.pathname}${url.search}`;
    }
  } catch {
    return "";
  }
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const [pathname, search = ""] = withSlash.split("?");
  const cleanPath = pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return search ? `${cleanPath}?${search}` : cleanPath;
}

export function isSafeAppPath(path: string): boolean {
  const normalized = normalizeAppPath(path);
  if (!normalized || normalized === "/") return false;
  return !BLOCKED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`) || normalized.startsWith(`${prefix}?`)
  );
}

export function parentPathFor(path: string): string {
  const normalized = normalizeAppPath(path);
  const pathname = normalized.split("?")[0] || "/hub";
  if (pathname === "/hub") return "/hub";
  if (pathname.startsWith("/studio/")) return "/studio";
  if (pathname === "/studio") return "/hub";
  if (/^\/vaults\/[^/]+$/.test(pathname)) return "/vaults";
  if (pathname.startsWith("/reader")) return "/hub";
  if (pathname.startsWith("/companion")) return "/hub";
  if (pathname.startsWith("/progress")) return "/hub";
  if (pathname.startsWith("/notes")) return "/hub";
  if (pathname.startsWith("/personalize")) return "/hub";
  if (pathname.startsWith("/sprint")) return "/hub";
  if (pathname.startsWith("/roadmap")) return "/hub";
  if (pathname.startsWith("/universe")) return "/hub";
  if (pathname.startsWith("/video")) return "/hub";
  if (pathname.startsWith("/body-type")) return "/hub";
  if (pathname.startsWith("/vaults")) return "/hub";
  if (pathname.startsWith("/synthesis")) return "/hub";
  if (pathname.startsWith("/instructor")) return "/hub";
  if (pathname.startsWith("/institute")) return "/hub";
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length > 1) return `/${parts.slice(0, -1).join("/")}`;
  return "/hub";
}

function readStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(APP_NAV_STACK_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeAppPath)
      .filter(isSafeAppPath)
      .slice(-40);
  } catch {
    return [];
  }
}

function writeStack(stack: string[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(APP_NAV_STACK_KEY, JSON.stringify(stack.slice(-40)));
}

/** True only after an in-tab path change. A refresh must not call history.back(). */
let clientNavigated = false;

export function resetAppBackClientStateForTests(): void {
  clientNavigated = false;
}

/** Keep the session stack aligned with in-app visits, including browser Back. */
export function recordAppVisit(path: string): void {
  if (typeof window === "undefined") return;
  const next = normalizeAppPath(path);
  if (!isSafeAppPath(next)) return;
  const stack = readStack();
  const existing = stack.lastIndexOf(next);
  if (existing >= 0) {
    writeStack(stack.slice(0, existing + 1));
    return;
  }
  if (stack[stack.length - 1] === next) return;
  if (stack.length > 0) clientNavigated = true;
  writeStack([...stack, next]);
}

export function previousAppPath(current: string): string | null {
  const here = normalizeAppPath(current);
  const stack = readStack();
  const index = stack.lastIndexOf(here);
  if (index > 0) {
    const previous = stack[index - 1];
    return previous && isSafeAppPath(previous) && previous !== here ? previous : null;
  }
  if (stack.length >= 2 && stack[stack.length - 1] === here) {
    const previous = stack[stack.length - 2];
    return previous && isSafeAppPath(previous) && previous !== here ? previous : null;
  }
  return null;
}

export function resolveAppBack(current: string): {
  href: string;
  useHistory: boolean;
  visible: boolean;
} {
  const here = normalizeAppPath(current);
  if (!isSafeAppPath(here)) {
    return { href: "/hub", useHistory: false, visible: false };
  }
  const previous = previousAppPath(here);
  if (previous) {
    return {
      href: previous,
      useHistory: clientNavigated,
      visible: true,
    };
  }
  if (here === "/hub" || here.startsWith("/hub?")) {
    return { href: "/hub", useHistory: false, visible: false };
  }
  return { href: parentPathFor(here), useHistory: false, visible: true };
}

type LeaveGuard = () => string | null;

const leaveGuards = new Set<LeaveGuard>();

export function registerLeaveGuard(guard: LeaveGuard): () => void {
  leaveGuards.add(guard);
  return () => {
    leaveGuards.delete(guard);
  };
}

export function leaveWarning(): string | null {
  for (const guard of leaveGuards) {
    const message = guard();
    if (message) return message;
  }
  return null;
}

export function confirmLeaveIfNeeded(): boolean {
  if (typeof window === "undefined") return true;
  const message = leaveWarning();
  if (!message) return true;
  return window.confirm(message);
}
