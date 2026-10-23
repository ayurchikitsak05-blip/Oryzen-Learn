import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import { createId, ROADMAP_STORAGE_KEY } from "./defaults";
import { buildRoadmapPlan, sanitizeIntake } from "./engine";
import { sanitizeRecord } from "./sanitize";
import { localIsoDate } from "./time";
import type { RoadmapIntake, RoadmapRecord } from "./types";

export { sanitizeRecord };

export function createRoadmapRecord(input: {
  userId: string;
  intake: RoadmapIntake;
  today: string;
}): RoadmapRecord {
  const intake = sanitizeIntake(input.intake, input.intake.examDate);
  return {
    version: 1,
    id: createId("roadmap"),
    userId: input.userId,
    intake,
    plan: buildRoadmapPlan(intake, input.today),
    completions: {},
    updatedAt: new Date().toISOString(),
  };
}

export function roadmapStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(ROADMAP_STORAGE_KEY, userId);
}

export function snapshotStorageKey(userId: string | null | undefined, at: string): string {
  return `${roadmapStorageKey(userId)}::snapshot::${at}`;
}

export function readLocalRoadmap(userId?: string | null): RoadmapRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(roadmapStorageKey(userId));
    if (!raw) return null;
    return sanitizeRecord(JSON.parse(raw), userId || "local-anonymous");
  } catch {
    return null;
  }
}

export function writeLocalRoadmap(record: RoadmapRecord, userId?: string | null): RoadmapRecord {
  const scoped = { ...record, userId: userId || record.userId };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(roadmapStorageKey(userId), JSON.stringify(scoped));
  }
  return scoped;
}

export function clearLocalRoadmap(userId?: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(roadmapStorageKey(userId));
}

export function snapshotLocalRoadmap(record: RoadmapRecord, userId?: string | null): string {
  const at = new Date().toISOString();
  const key = snapshotStorageKey(userId, at);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify({ ...record, userId: userId || record.userId }));
  }
  return key;
}

export function exportRoadmapJson(record: RoadmapRecord): string {
  return JSON.stringify(record, null, 2);
}

export function exportRoadmapFilename(record: RoadmapRecord, now = new Date()): string {
  const day = Number.isNaN(now.getTime()) ? localIsoDate() : now.toISOString().slice(0, 10);
  const exam = record.intake.examName.trim().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `oryzen-study-plan-${exam || "roadmap"}-${day}.json`;
}

export function downloadRoadmapCopy(record: RoadmapRecord): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([exportRoadmapJson(record)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportRoadmapFilename(record);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type RemotePersistCode =
  | "table_missing"
  | "offline"
  | "unavailable"
  | "conflict"
  | "payload_too_large"
  | "too_complex"
  | "malformed"
  | "unauthorized";

export type RemoteFetchResult = {
  record: RoadmapRecord | null;
  persist: "server" | "local";
  error?: string;
  code?: RemotePersistCode;
};

export type RemoteSaveResult = {
  persist: "server" | "local";
  error?: string;
  code?: RemotePersistCode;
  record?: RoadmapRecord | null;
  id?: string;
};

function asCode(value: unknown): RemotePersistCode | undefined {
  const allowed: RemotePersistCode[] = [
    "table_missing",
    "offline",
    "unavailable",
    "conflict",
    "payload_too_large",
    "too_complex",
    "malformed",
    "unauthorized",
  ];
  return typeof value === "string" && allowed.includes(value as RemotePersistCode)
    ? (value as RemotePersistCode)
    : undefined;
}

export async function fetchRemoteRoadmap(): Promise<RemoteFetchResult> {
  try {
    const response = await fetch("/api/roadmap", { credentials: "same-origin" });
    const json = (await response.json().catch(() => null)) as {
      record?: RoadmapRecord | null;
      persist?: "server" | "local";
      error?: string;
      code?: string;
      reason?: string;
    } | null;
    if (response.status === 401) {
      return { record: null, persist: "local", error: json?.error, code: "unauthorized" };
    }
    if (!response.ok) {
      return {
        record: null,
        persist: "local",
        error: json?.error || "Your plan is saved on this device. The account copy could not be reached just now.",
        code: "unavailable",
      };
    }
    const persist = json?.persist === "server" ? "server" : "local";
    const reason = json?.reason === "table_missing" ? "table_missing" : asCode(json?.code);
    return {
      record: json?.record ?? null,
      persist,
      error: json?.error,
      code: persist === "local" ? reason ?? "table_missing" : reason,
    };
  } catch {
    return {
      record: null,
      persist: "local",
      code: "offline",
      error: "Your plan is saved on this device. Try again when you are back online.",
    };
  }
}

export async function saveRemoteRoadmap(
  record: RoadmapRecord,
  input?: { expectedUpdatedAt?: string | null }
): Promise<RemoteSaveResult> {
  const expectedUpdatedAt = input?.expectedUpdatedAt ?? null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (expectedUpdatedAt) headers["If-Unmodified-Since"] = expectedUpdatedAt;
    const response = await fetch("/api/roadmap", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({
        action: "save",
        record,
        expectedUpdatedAt,
      }),
    });
    const json = (await response.json().catch(() => null)) as {
      persist?: "server" | "local";
      error?: string;
      code?: string;
      reason?: string;
      record?: RoadmapRecord | null;
      id?: string;
    } | null;
    const code =
      asCode(json?.code) ??
      (json?.reason === "table_missing" ? "table_missing" : undefined) ??
      (response.status === 409 ? "conflict" : undefined) ??
      (response.status === 413 ? "payload_too_large" : undefined);
    if (response.status === 409) {
      return {
        persist: "server",
        error: json?.error || "This device and your account have different study plans.",
        code: "conflict",
        record: json?.record ?? null,
      };
    }
    if (!response.ok) {
      return {
        persist: "local",
        error: json?.error || "Your plan is saved on this device. The account copy could not be reached just now.",
        code: code ?? "unavailable",
        record: json?.record ?? null,
      };
    }
    return {
      persist: json?.persist === "server" ? "server" : "local",
      code: json?.persist === "server" ? undefined : code ?? "table_missing",
      record: json?.record ?? null,
      id: json?.id,
    };
  } catch {
    return {
      persist: "local",
      code: "offline",
      error: "Your plan is saved on this device. Try again when you are back online.",
    };
  }
}

/** @deprecated Hydrate must use decideHydrate — never silent last-write-wins. */
export function newerRecord(
  local: RoadmapRecord | null,
  remote: RoadmapRecord | null
): RoadmapRecord | null {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt) ? remote : local;
}
