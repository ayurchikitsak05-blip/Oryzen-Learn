/**
 * Install as an app (owner, 27 Nov 2026). Chrome and Edge fire `beforeinstallprompt` once, early,
 * so it is caught at start-up and kept here; iPhone Safari has no prompt, so it gets instructions.
 */
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export const INSTALL_DISMISSED_KEY = "oryzen_install_dismissed_v1";

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

export function setDeferredInstall(event: InstallEvent | null): void {
  deferred = event;
  listeners.forEach((listener) => listener());
}

export function deferredInstall(): InstallEvent | null {
  return deferred;
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isStandalone(win: Window = window): boolean {
  return win.matchMedia?.("(display-mode: standalone)").matches || (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone or iPad in Safari (iPadOS reports itself as a Mac with touch). */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}

export type InstallMode = "installed" | "prompt" | "ios" | "none";

export function installMode(input: { standalone: boolean; hasPrompt: boolean; userAgent: string; maxTouchPoints?: number }): InstallMode {
  if (input.standalone) return "installed";
  if (input.hasPrompt) return "prompt";
  if (isIosSafari(input.userAgent, input.maxTouchPoints)) return "ios";
  return "none";
}
