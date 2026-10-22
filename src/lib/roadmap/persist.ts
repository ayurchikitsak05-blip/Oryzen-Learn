import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import { createId, ROADMAP_STORAGE_KEY } from "./defaults";
import { buildRoadmapPlan, sanitizeIntake } from "./engine";
import { isIsoDate, localIsoDate } from "./time";
import type { RoadmapIntake, RoadmapPlan, RoadmapRecord, SessionCompletion } from "./types";

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

function sanitizeCompletions(value: unknown): Record<string, SessionCompletion> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, SessionCompletion> = {};
  for (const [id, row] of Object.entries(value as Record<string, SessionCompletion>)) {
    if (!id || !row || typeof row !== "object") continue;
    if (typeof row.completedAt !== "string") continue;
    next[id] = { completedAt: row.completedAt };
  }
  return next;
}

function looksLikePlan(value: unknown): value is RoadmapPlan {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<RoadmapPlan>;
  return Array.isArray(raw.days) && Boolean(raw.overflow);
}

export function sanitizeRecord(value: unknown, userId: string): RoadmapRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<RoadmapRecord>;
  if (!looksLikePlan(raw.plan) || !raw.intake) return null;
  const today = isIsoDate(String(raw.plan.today)) ? raw.plan.today : localIsoDate();
  const intake = sanitizeIntake(raw.intake, raw.intake.examDate || raw.plan.examDate || today);
  return {
    version: 1,
    id: String(raw.id || `roadmap-${userId}`),
    userId,
    intake,
    plan: raw.plan,
    completions: sanitizeCompletions(raw.completions),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
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

export async function fetchRemoteRoadmap(): Promise<{
  record: RoadmapRecord | null;
  persist: "server" | "local";
  error?: string;
}> {
  const response = await fetch("/api/roadmap", { credentials: "same-origin" });
  const json = (await response.json().catch(() => null)) as {
    record?: RoadmapRecord | null;
    persist?: "server" | "local";
    error?: string;
  } | null;
  if (response.status === 401) {
    return { record: null, persist: "local", error: json?.error };
  }
  if (!response.ok) {
    return { record: null, persist: "local", error: json?.error };
  }
  return {
    record: json?.record ?? null,
    persist: json?.persist === "server" ? "server" : "local",
  };
}

export async function saveRemoteRoadmap(record: RoadmapRecord): Promise<{
  persist: "server" | "local";
  error?: string;
}> {
  const response = await fetch("/api/roadmap", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save", record }),
  });
  const json = (await response.json().catch(() => null)) as {
    persist?: "server" | "local";
    error?: string;
  } | null;
  if (!response.ok) {
    return { persist: "local", error: json?.error };
  }
  return { persist: json?.persist === "server" ? "server" : "local" };
}

export function newerRecord(
  local: RoadmapRecord | null,
  remote: RoadmapRecord | null
): RoadmapRecord | null {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt) ? remote : local;
}
