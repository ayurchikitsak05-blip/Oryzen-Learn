import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveDeviceSessionRow, DeviceCategory } from "./types";

export const MAX_ACTIVE_DEVICES_PER_USER = 2;
export const ALLOWED_DEVICE_SLOTS: readonly DeviceCategory[] = [
  "tablet",
  "phone",
] as const;

export interface RegisterDeviceSessionInput {
  userId: string;
  deviceId: string;
  deviceType: DeviceCategory;
  deviceLabel?: string;
  sessionTokenHash: string;
}

export interface DeviceLockEnforcementResult {
  allowed: boolean;
  activeSession: ActiveDeviceSessionRow;
  revokedSessionIds: string[];
  activeTabletSession: ActiveDeviceSessionRow | null;
  activePhoneSession: ActiveDeviceSessionRow | null;
}

/**
 * Classifies a client device into "tablet" (iPad, Android Tablet, Desktop/Laptop large study screen)
 * or "phone" (iPhone, Android Mobile handset) for the Strict 2-Device Lock (1 Tablet + 1 Phone).
 */
export function detectDeviceCategory(
  userAgent: string,
  explicitCategory?: string | null
): DeviceCategory {
  if (explicitCategory === "tablet" || explicitCategory === "phone") {
    return explicitCategory;
  }

  const ua = userAgent.toLowerCase();

  // iPadOS / Android tablets / Fire Tablet / PlayBook
  if (
    ua.includes("ipad") ||
    ua.includes("tablet") ||
    ua.includes("playbook") ||
    ua.includes("silk") ||
    (ua.includes("android") && !ua.includes("mobile")) ||
    (ua.includes("macintosh") && ua.includes("mobile"))
  ) {
    return "tablet";
  }

  // Mobile phones (iPhone, Android Mobile, iPod)
  if (
    ua.includes("iphone") ||
    ua.includes("ipod") ||
    (ua.includes("android") && ua.includes("mobile")) ||
    ua.includes("windows phone")
  ) {
    return "phone";
  }

  // Default large-screen study workstation / iPad desktop-class UA maps to the "tablet" slot
  return "tablet";
}

/**
 * Pure deterministic evaluator that takes a user's existing active sessions and a new incoming
 * device login, and computes which existing sessions must be revoked to strictly maintain:
 *   Max 1 active "tablet" session + Max 1 active "phone" session (2 devices total).
 */
export function evaluateTwoDeviceLockPolicy(
  existingSessions: ActiveDeviceSessionRow[],
  incoming: RegisterDeviceSessionInput
): {
  sessionsToRevoke: ActiveDeviceSessionRow[];
  retainedSessions: ActiveDeviceSessionRow[];
} {
  if (!incoming.userId || !incoming.deviceId || !incoming.sessionTokenHash) {
    throw new Error(
      "Invalid device session payload: userId, deviceId, and sessionTokenHash are required."
    );
  }

  if (incoming.deviceType !== "tablet" && incoming.deviceType !== "phone") {
    throw new Error(
      `Unsupported device_type "${String(incoming.deviceType)}". Must be "tablet" or "phone".`
    );
  }

  const activeForUser = existingSessions.filter(
    (s) => s.user_id === incoming.userId && !s.is_revoked
  );

  const sessionsToRevoke: ActiveDeviceSessionRow[] = [];
  const retainedSessions: ActiveDeviceSessionRow[] = [];

  // Group by opposite slot vs same slot
  const oppositeSlotType: DeviceCategory =
    incoming.deviceType === "tablet" ? "phone" : "tablet";

  // Sort opposite slot by last_active_at descending so at most 1 newest opposite-slot device is kept
  const oppositeSlotSessions = activeForUser
    .filter((s) => s.device_type === oppositeSlotType)
    .sort(
      (a, b) =>
        new Date(b.last_active_at).getTime() -
        new Date(a.last_active_at).getTime()
    );

  oppositeSlotSessions.forEach((session, idx) => {
    if (idx === 0 && session.device_id !== incoming.deviceId) {
      retainedSessions.push(session);
    } else {
      sessionsToRevoke.push(session);
    }
  });

  // Any existing active session in the SAME slot ("tablet" or "phone") from a different device_id
  // or stale session on the same device_id is revoked so the new login becomes the sole active session for that slot.
  const sameSlotSessions = activeForUser.filter(
    (s) => s.device_type === incoming.deviceType
  );
  for (const session of sameSlotSessions) {
    if (session.device_id !== incoming.deviceId) {
      sessionsToRevoke.push(session);
    }
  }

  return {
    sessionsToRevoke,
    retainedSessions,
  };
}

/**
 * Enforces the Strict 2-Device Lock against Supabase `active_device_sessions`.
 * Guarantees at most 1 active Tablet + 1 active Phone session per user ID.
 */
export async function enforceTwoDeviceLock(
  supabase: SupabaseClient,
  input: RegisterDeviceSessionInput
): Promise<DeviceLockEnforcementResult> {
  const { data: existingRows, error: fetchError } = await supabase
    .from("active_device_sessions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("is_revoked", false);

  if (fetchError) {
    throw new Error(
      `Failed to query active device sessions: ${fetchError.message}`
    );
  }

  const existingSessions = (existingRows ?? []) as ActiveDeviceSessionRow[];
  const { sessionsToRevoke, retainedSessions } = evaluateTwoDeviceLockPolicy(
    existingSessions,
    input
  );

  const revokedSessionIds = sessionsToRevoke.map((s) => s.id);
  const nowIso = new Date().toISOString();

  if (revokedSessionIds.length > 0) {
    const { error: revokeError } = await supabase
      .from("active_device_sessions")
      .update({ is_revoked: true, last_active_at: nowIso })
      .in("id", revokedSessionIds);

    if (revokeError) {
      throw new Error(
        `Failed to revoke superseded device sessions: ${revokeError.message}`
      );
    }
  }

  // Upsert the incoming device session for (user_id, device_id)
  const upsertPayload = {
    user_id: input.userId,
    device_id: input.deviceId,
    device_type: input.deviceType,
    device_label:
      input.deviceLabel ??
      (input.deviceType === "tablet" ? "Study Tablet" : "Study Phone"),
    session_token_hash: input.sessionTokenHash,
    is_revoked: false,
    last_active_at: nowIso,
  };

  const { data: upsertedRow, error: upsertError } = await supabase
    .from("active_device_sessions")
    .upsert(upsertPayload, { onConflict: "user_id,device_id" })
    .select("*")
    .single();

  if (upsertError || !upsertedRow) {
    throw new Error(
      `Failed to register active device session: ${
        upsertError?.message ?? "No row returned"
      }`
    );
  }

  const activeSession = upsertedRow as ActiveDeviceSessionRow;
  const oppositeSession = retainedSessions[0] ?? null;

  return {
    allowed: true,
    activeSession,
    revokedSessionIds,
    activeTabletSession:
      input.deviceType === "tablet" ? activeSession : oppositeSession,
    activePhoneSession:
      input.deviceType === "phone" ? activeSession : oppositeSession,
  };
}

/**
 * Verifies whether a device's current session is still active and unrevoked under the 2-Device Lock.
 */
export async function verifyDeviceSessionActive(
  supabase: SupabaseClient,
  userId: string,
  deviceId: string
): Promise<{ isActive: boolean; session: ActiveDeviceSessionRow | null }> {
  const { data, error } = await supabase
    .from("active_device_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error || !data) {
    return { isActive: false, session: null };
  }

  const session = data as ActiveDeviceSessionRow;
  return {
    isActive: !session.is_revoked,
    session,
  };
}
