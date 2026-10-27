import { afterEach, describe, expect, it, vi } from "vitest";
import { coachStorageKey } from "@/lib/coach/persist";
import { defaultIntake } from "../defaults";
import {
  ROADMAP_MAX_BYTES,
  ROADMAP_MAX_DAYS,
  rejectRawPayloadSize,
} from "../limits";
import {
  clearLocalRoadmap,
  createRoadmapRecord,
  exportRoadmapFilename,
  exportRoadmapJson,
  fetchRemoteRoadmap,
  readLocalRoadmap,
  roadmapStorageKey,
  sanitizeRecord,
  snapshotLocalRoadmap,
  writeLocalRoadmap,
} from "../persist";
import { decideHydrate } from "../sync";
import { prepareRoadmapRecord } from "../sanitize";
import { readPrivateString } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

const TODAY = "2026-11-02";

function sample(userId: string) {
  return createRoadmapRecord({
    userId,
    intake: defaultIntake("2026-12-31"),
    today: TODAY,
  });
}

describe("roadmap persist", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps a student plan in localStorage when the table is not live", async () => {
    await unlockTestVault("student-1");
    const record = sample("student-1");
    writeLocalRoadmap(record, "student-1");
    const loaded = readLocalRoadmap("student-1");
    expect(loaded?.userId).toBe("student-1");
    expect(loaded?.plan.days.length).toBeGreaterThan(0);
    expect(readLocalRoadmap("student-2")).toBeNull();
    clearLocalRoadmap("student-1");
    expect(readLocalRoadmap("student-1")).toBeNull();
  });

  it("rejects corrupt stored JSON", () => {
    expect(sanitizeRecord({ hello: "no" }, "student-1")).toBeNull();
  });

  it("isolates roadmap keys per student and leaves coach on its own local key", () => {
    expect(roadmapStorageKey("student-a")).toBe("oryzen_study_roadmap_v1::student-a");
    expect(roadmapStorageKey("student-b")).toBe("oryzen_study_roadmap_v1::student-b");
    expect(roadmapStorageKey("student-a")).not.toBe(roadmapStorageKey("student-b"));
    expect(coachStorageKey("student-a")).toBe("oryzen_study_coach_v1::student-a");
    expect(coachStorageKey("student-a")).not.toBe(roadmapStorageKey("student-a"));
  });

  it("keeps a dated snapshot for Keep Both without replacing the live local plan", async () => {
    await unlockTestVault("student-1");
    const record = sample("student-1");
    writeLocalRoadmap(record, "student-1");
    const key = snapshotLocalRoadmap(record, "student-1");
    expect(key).toContain("oryzen_study_roadmap_v1::student-1::snapshot::");
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(readPrivateString("oryzen_study_roadmap_snapshot_v1", "student-1")).toContain(record.id);
    expect(readLocalRoadmap("student-1")?.id).toBe(record.id);
    expect(exportRoadmapJson(record)).toContain(record.id);
    expect(exportRoadmapFilename(record, new Date("2026-11-02T00:00:00.000Z"))).toContain("2026-11-02");
  });
});

describe("roadmap sanitizer and upload limits", () => {
  it("binds the session user and drops extra plan fields", () => {
    const record = sample("attacker");
    const prepared = prepareRoadmapRecord(
      {
        ...record,
        userId: "attacker",
        plan: { ...record.plan, extra: "drop-me", days: record.plan.days },
      },
      "session-user"
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.record.userId).toBe("session-user");
    expect(prepared.record.plan).not.toHaveProperty("extra");
    expect(prepared.record.plan.weeks.length).toBeGreaterThan(0);
  });

  it("rejects malformed JSON-shaped records", () => {
    const prepared = prepareRoadmapRecord({ plan: { days: "nope" } }, "student-1");
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.status).toBe(400);
    expect(prepared.code).toBe("malformed");
  });

  it("rejects oversized raw payloads", () => {
    const huge = "x".repeat(ROADMAP_MAX_BYTES + 8);
    const rejected = rejectRawPayloadSize(huge);
    expect(rejected?.status).toBe(413);
    expect(rejected?.code).toBe("payload_too_large");
    expect(rejectRawPayloadSize("{}")).toBeNull();
  });

  it("rejects too many days instead of truncating", () => {
    const record = sample("student-1");
    const day = record.plan.days[0];
    const prepared = prepareRoadmapRecord(
      {
        ...record,
        plan: {
          ...record.plan,
          days: Array.from({ length: ROADMAP_MAX_DAYS + 1 }, () => day),
        },
      },
      "student-1"
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.status).toBe(400);
    expect(prepared.code).toBe("too_complex");
  });
});

describe("roadmap remote loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a slow account copy and then returns it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                new Response(JSON.stringify({ record: null, persist: "server" }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                })
              );
            }, 30);
          })
      )
    );
    const result = await fetchRemoteRoadmap(200);
    expect(result.persist).toBe("server");
    expect(result.record).toBeNull();
  });

  it("stops a request that never returns and keeps the device plan", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const remote = await fetchRemoteRoadmap(20);
    expect(remote.code).toBe("offline");
    expect(remote.persist).toBe("local");
    const local = sample("student-1");
    const decision = decideHydrate({
      local,
      remote: remote.record,
      persist: remote.persist,
      code: remote.code,
      error: remote.error,
    });
    expect(decision.kind).toBe("offline");
    if (decision.kind === "offline") expect(decision.local?.id).toBe(local.id);
  });

  it("treats a failed account copy as unavailable without dropping the device plan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 500 }))
    );
    const remote = await fetchRemoteRoadmap();
    expect(remote.code).toBe("unavailable");
    const local = sample("student-1");
    const decision = decideHydrate({
      local,
      remote: null,
      persist: remote.persist,
      code: remote.code,
      error: remote.error,
    });
    expect(decision.kind).toBe("offline");
    if (decision.kind === "offline") expect(decision.local?.userId).toBe("student-1");
  });
});
