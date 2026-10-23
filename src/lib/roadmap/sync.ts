import type { RoadmapRecord } from "./types";

export type HydrateDecision =
  | { kind: "empty" }
  | { kind: "local-only"; record: RoadmapRecord }
  | { kind: "use-server"; record: RoadmapRecord }
  | { kind: "import-prompt"; local: RoadmapRecord }
  | { kind: "conflict"; local: RoadmapRecord; remote: RoadmapRecord }
  | { kind: "offline"; local: RoadmapRecord | null; error: string };

export type WriteConflictDecision = "insert" | "update" | "conflict";

export function sameTimestamp(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return left === right;
  return a === b;
}

export function parseExpectedUpdatedAt(
  header: string | null | undefined,
  bodyValue: unknown
): string | null {
  if (typeof bodyValue === "string" && bodyValue.trim()) {
    const parsed = Date.parse(bodyValue);
    return Number.isNaN(parsed) ? bodyValue.trim() : new Date(parsed).toISOString();
  }
  if (!header) return null;
  const parsed = Date.parse(header);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * Conditional write: never last-write-wins.
 * A live server row can only be replaced when the client sends the timestamp it last read.
 */
export function evaluateWriteConflict(input: {
  serverUpdatedAt: string | null | undefined;
  expectedUpdatedAt: string | null | undefined;
}): WriteConflictDecision {
  if (!input.serverUpdatedAt) {
    return input.expectedUpdatedAt ? "conflict" : "insert";
  }
  if (!input.expectedUpdatedAt) return "conflict";
  return sameTimestamp(input.serverUpdatedAt, input.expectedUpdatedAt) ? "update" : "conflict";
}

export function roadmapContentKey(record: RoadmapRecord): string {
  return JSON.stringify({
    intake: record.intake,
    days: record.plan.days,
    overflow: record.plan.overflow,
    completions: record.completions,
  });
}

export function roadmapContentsEqual(left: RoadmapRecord, right: RoadmapRecord): boolean {
  return roadmapContentKey(left) === roadmapContentKey(right);
}

/**
 * Hydrate is never silent last-write-wins and never auto-uploads local when the account is empty.
 */
export function decideHydrate(input: {
  local: RoadmapRecord | null;
  remote: RoadmapRecord | null;
  persist: "server" | "local";
  code?: string | null;
  error?: string | null;
}): HydrateDecision {
  if (input.code === "offline" || input.code === "unavailable") {
    return {
      kind: "offline",
      local: input.local,
      error:
        input.error ||
        "Your plan is saved on this device. The account copy could not be reached just now.",
    };
  }

  if (input.persist !== "server") {
    return input.local ? { kind: "local-only", record: input.local } : { kind: "empty" };
  }

  if (input.remote && input.local) {
    if (roadmapContentsEqual(input.local, input.remote)) {
      return { kind: "use-server", record: input.remote };
    }
    return { kind: "conflict", local: input.local, remote: input.remote };
  }

  if (input.remote) return { kind: "use-server", record: input.remote };
  if (input.local) return { kind: "import-prompt", local: input.local };
  return { kind: "empty" };
}

export function scopedUserFilter(userId: string): { column: "user_id"; value: string } {
  return { column: "user_id", value: userId };
}
