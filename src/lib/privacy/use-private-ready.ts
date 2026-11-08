"use client";

import { useEffect, useState } from "react";
import { privateAccessAllowed } from "./account-vault";

/**
 * True once this student's private record is open on this device. The record opens a moment
 * after sign-in, so this checks again every second for up to 30 seconds.
 */
export function usePrivateReady(userId: string | null | undefined): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!userId || userId === "local-anonymous") {
      setReady(false);
      return;
    }
    if (privateAccessAllowed(userId)) {
      setReady(true);
      return;
    }
    setReady(false);
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (privateAccessAllowed(userId)) {
        setReady(true);
        window.clearInterval(timer);
      } else if (tries >= 30) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [userId]);
  return ready;
}
