import { describe, expect, it } from "vitest";
import { defaultIntake } from "../defaults";
import { createRoadmapRecord } from "../persist";
import {
  decideHydrate,
  evaluateWriteConflict,
  parseExpectedUpdatedAt,
  roadmapContentsEqual,
  scopedUserFilter,
  sameTimestamp,
} from "../sync";
import { bindRecordOwner } from "../sanitize";

const TODAY = "2026-11-02";

function sample(userId: string, examName = "Board exam") {
  const intake = { ...defaultIntake("2026-12-31"), examName };
  return createRoadmapRecord({ userId, intake, today: TODAY });
}

describe("roadmap sync decisions", () => {
  it("never auto-imports local when the account is empty", () => {
    const local = sample("student-a");
    const decision = decideHydrate({
      local,
      remote: null,
      persist: "server",
    });
    expect(decision.kind).toBe("import-prompt");
    if (decision.kind === "import-prompt") {
      expect(decision.local.userId).toBe("student-a");
    }
  });

  it("does not pick the newer copy on conflict", () => {
    const local = { ...sample("student-a", "Device plan"), updatedAt: "2026-11-02T12:00:00.000Z" };
    const remote = { ...sample("student-a", "Account plan"), updatedAt: "2026-11-01T08:00:00.000Z" };
    expect(Date.parse(local.updatedAt)).toBeGreaterThan(Date.parse(remote.updatedAt));
    const decision = decideHydrate({ local, remote, persist: "server" });
    expect(decision.kind).toBe("conflict");
  });

  it("uses the account copy when this device has none", () => {
    const remote = sample("student-a");
    const decision = decideHydrate({ local: null, remote, persist: "server" });
    expect(decision.kind).toBe("use-server");
  });

  it("stays local-only when the table is missing", () => {
    const local = sample("student-a");
    const decision = decideHydrate({
      local,
      remote: null,
      persist: "local",
      code: "table_missing",
    });
    expect(decision.kind).toBe("local-only");
  });

  it("keeps the local copy when the account cannot be reached", () => {
    const local = sample("student-a");
    const decision = decideHydrate({
      local,
      remote: null,
      persist: "local",
      code: "offline",
      error: "offline",
    });
    expect(decision.kind).toBe("offline");
    if (decision.kind === "offline") expect(decision.local?.id).toBe(local.id);
  });

  it("treats matching content as the same plan", () => {
    const record = sample("student-a");
    expect(roadmapContentsEqual(record, { ...record, updatedAt: "2099-01-01T00:00:00.000Z" })).toBe(true);
    const decision = decideHydrate({
      local: record,
      remote: { ...record, updatedAt: "2099-01-01T00:00:00.000Z" },
      persist: "server",
    });
    expect(decision.kind).toBe("use-server");
  });
});

describe("conditional writes", () => {
  it("inserts only when the account has no row and no expected timestamp", () => {
    expect(evaluateWriteConflict({ serverUpdatedAt: null, expectedUpdatedAt: null })).toBe("insert");
  });

  it("returns 409 when a live row would be replaced without a matching timestamp", () => {
    expect(
      evaluateWriteConflict({
        serverUpdatedAt: "2026-11-02T10:00:00.000Z",
        expectedUpdatedAt: null,
      })
    ).toBe("conflict");
    expect(
      evaluateWriteConflict({
        serverUpdatedAt: "2026-11-02T10:00:00.000Z",
        expectedUpdatedAt: "2026-11-01T10:00:00.000Z",
      })
    ).toBe("conflict");
  });

  it("updates when If-Unmodified-Since matches the server row", () => {
    expect(
      evaluateWriteConflict({
        serverUpdatedAt: "2026-11-02T10:00:00.000Z",
        expectedUpdatedAt: "2026-11-02T10:00:00.000Z",
      })
    ).toBe("update");
    expect(
      sameTimestamp("2026-11-02T10:00:00.000Z", parseExpectedUpdatedAt("2026-11-02T10:00:00.000Z", null))
    ).toBe(true);
  });

  it("does not replace a newer server row with an older expected timestamp", () => {
    expect(
      evaluateWriteConflict({
        serverUpdatedAt: "2026-11-03T00:00:00.000Z",
        expectedUpdatedAt: "2026-11-02T00:00:00.000Z",
      })
    ).toBe("conflict");
  });
});

describe("student isolation helpers", () => {
  it("always binds the session user and scopes queries by user_id", () => {
    const foreign = sample("student-b");
    const bound = bindRecordOwner(foreign, "student-a");
    expect(bound.userId).toBe("student-a");
    expect(foreign.userId).toBe("student-b");
    expect(scopedUserFilter("student-a")).toEqual({ column: "user_id", value: "student-a" });
    expect(scopedUserFilter("student-a").value).not.toBe(scopedUserFilter("student-b").value);
  });
});
