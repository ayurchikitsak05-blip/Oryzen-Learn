import { afterEach, describe, expect, it } from "vitest";
import { defaultIntake } from "../defaults";
import {
  clearLocalRoadmap,
  createRoadmapRecord,
  readLocalRoadmap,
  sanitizeRecord,
  writeLocalRoadmap,
} from "../persist";

describe("roadmap persist", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps a student plan in localStorage when the table is not live", () => {
    const record = createRoadmapRecord({
      userId: "student-1",
      intake: defaultIntake("2026-12-31"),
      today: "2026-11-02",
    });
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
});
