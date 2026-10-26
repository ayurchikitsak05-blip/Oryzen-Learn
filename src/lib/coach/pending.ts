import { registerVaultLockHook } from "@/lib/privacy/account-vault";
import type { CoachActionId, CoachTrigger } from "./types";

registerVaultLockHook(() => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(COACH_PENDING_KEY);
  window.sessionStorage.removeItem(COACH_FORCE_TRIGGER_KEY);
});

export const COACH_PENDING_KEY = "oryzen_coach_pending_v1";
export const COACH_FORCE_TRIGGER_KEY = "oryzen_coach_force_trigger";

export type PendingCoachAction =
  | { kind: "action"; action: CoachActionId }
  | { kind: "overwhelmed" }
  | { kind: "focus"; sessionId: string };

export function setPendingCoachAction(pending: PendingCoachAction): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(COACH_PENDING_KEY, JSON.stringify(pending));
}

export function takePendingCoachAction(): PendingCoachAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(COACH_PENDING_KEY);
    window.sessionStorage.removeItem(COACH_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCoachAction;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setForcedTrigger(trigger: CoachTrigger | null): void {
  if (typeof window === "undefined") return;
  if (!trigger) {
    window.sessionStorage.removeItem(COACH_FORCE_TRIGGER_KEY);
    return;
  }
  window.sessionStorage.setItem(COACH_FORCE_TRIGGER_KEY, trigger);
}

export function readForcedTrigger(): CoachTrigger | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(COACH_FORCE_TRIGGER_KEY);
  return value as CoachTrigger | null;
}
