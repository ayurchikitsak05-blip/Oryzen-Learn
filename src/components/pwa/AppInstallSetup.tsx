"use client";

import { useEffect } from "react";
import { setDeferredInstall, type InstallEvent } from "@/lib/pwa/install";

/** Registers the service worker and keeps Chrome's install prompt for the Install button. */
export default function AppInstallSetup() {
  useEffect(() => {
    const keep = (event: Event) => {
      event.preventDefault();
      setDeferredInstall(event as InstallEvent);
    };
    const installed = () => setDeferredInstall(null);
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return null;
}
