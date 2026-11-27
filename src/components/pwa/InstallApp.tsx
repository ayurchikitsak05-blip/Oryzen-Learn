"use client";

import React, { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Download, Share, X } from "lucide-react";
import { ui } from "@/components/ui/classes";
import {
  INSTALL_DISMISSED_KEY,
  deferredInstall,
  installMode,
  isStandalone,
  onInstallChange,
  setDeferredInstall,
  type InstallMode,
} from "@/lib/pwa/install";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function currentMode(): InstallMode {
  return installMode({
    standalone: isStandalone(),
    hasPrompt: Boolean(deferredInstall()),
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

const noSubscribe = () => () => undefined;

/**
 * "Install Oryzen as an app". `dismissible` cards (Today) can be closed for good on this device;
 * the Tools page always shows it while the app can be installed.
 */
export function InstallApp({ dismissible = false }: { dismissible?: boolean }) {
  const mode = useSyncExternalStore<InstallMode>(onInstallChange, currentMode, () => "none");
  const savedDismissed = useSyncExternalStore(noSubscribe, () => dismissible && readDismissed(), () => true);
  const [closed, setClosed] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const hidden = savedDismissed || closed;

  if (hidden || mode === "none" || mode === "installed") return null;

  const install = async () => {
    const event = deferredInstall();
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setDeferredInstall(null);
  };

  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // Private mode: it just shows again next time.
    }
    setClosed(true);
  };

  return (
    <section className="card-soft relative flex flex-wrap items-center gap-3 p-4" data-testid="install-app">
      <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-heading">Install Oryzen as an app</h2>
        <p className="text-sm text-muted">Opens from your home screen in its own window, without the browser bar.</p>
        {iosHelp ? (
          <p className="mt-2 text-sm text-ink" data-testid="install-app-ios-help">
            In Safari, tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> Share, then “Add to Home Screen”.
          </p>
        ) : null}
      </div>
      {mode === "prompt" ? (
        <button type="button" className={`${ui.primary} min-h-11`} onClick={() => void install()} data-testid="install-app-button">
          <Download className="h-4 w-4" aria-hidden="true" />
          Install
        </button>
      ) : !iosHelp ? (
        <button type="button" className={`${ui.secondary} min-h-11`} onClick={() => setIosHelp(true)} data-testid="install-app-ios">
          Show me how
        </button>
      ) : null}
      {dismissible ? (
        <button type="button" onClick={dismiss} aria-label="Hide" className="absolute right-2 top-2 rounded-full p-1.5 text-muted hover:bg-beige-2" data-testid="install-app-dismiss">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
