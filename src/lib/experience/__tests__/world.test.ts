import { beforeEach, describe, expect, it } from "vitest";
import {
  discardAccountVault,
  flushAccountVault,
  lockAccountVault,
  PRIVATE_BROWSER_BASES,
  SEALED_PRIVATE_KEY,
} from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";
import { EMPTY_LEARNING_RECORD } from "../record";
import { evaluateLearning } from "../rewards";
import {
  commitLearningWorld,
  readLearningWorld,
  WORLD_STORAGE_KEY,
  writeLearningWorld,
} from "../world";

describe("learning world", () => {
  beforeEach(() => {
    discardAccountVault();
    window.localStorage.clear();
  });

  it("includes the Study Room record among sealed vault bases", () => {
    expect(PRIVATE_BROWSER_BASES).toContain(WORLD_STORAGE_KEY);
  });

  it("drops a locked sticker and keeps the room on the signed-in account", async () => {
    await unlockTestVault("student-a");
    const evaluation = evaluateLearning(
      {
        ...EMPTY_LEARNING_RECORD,
        notes: [{ id: "n", quote: "A saved note.", createdAt: "2026-10-01T00:00:00.000Z" }],
      },
      "2026-10-29"
    );
    const saved = writeLearningWorld(
      {
        version: 1,
        ownerId: "student-a",
        petName: "  Moth  ",
        petAccessory: "satchel",
        companionAccessory: "pin",
        background: "dusk",
        desk: "books",
        wall: "notes",
        placedStickerIds: ["read-note", "read-book"],
        shownBadgeIds: ["badge-note", "badge-chapter"],
        selectedTitleId: "title-explorer",
        favoriteStickerId: "read-book",
        readiness: [{ date: "2026-10-29", feeling: "tired" }],
      },
      "student-a",
      evaluation
    );
    expect(saved.petName).toBe("Moth");
    expect(saved.placedStickerIds).toEqual(["read-note"]);
    expect(saved.shownBadgeIds).toEqual(["badge-note"]);
    expect(saved.favoriteStickerId).toBeNull();
    expect(saved.selectedTitleId).toBeNull();
    expect(saved.petAccessory).toBe("none");
    expect(saved.background).toBe("paper");
    expect(saved.desk).toBe("plain");
    expect(saved.wall).toBe("notes");
    expect(saved.companionAccessory).toBe("pin");
    expect(readLearningWorld("student-a", evaluation).petName).toBe("Moth");

    discardAccountVault();
    await unlockTestVault("student-b");
    expect(readLearningWorld("student-b", evaluateLearning(EMPTY_LEARNING_RECORD, "2026-10-29")).petName).toBe("");
  });

  it("restores the pet name after seal, lock, and unlock on the same account", async () => {
    await unlockTestVault("student-a");
    const evaluation = evaluateLearning(
      {
        ...EMPTY_LEARNING_RECORD,
        notes: [{ id: "n1", quote: "A saved note.", createdAt: "2026-10-01T00:00:00.000Z" }],
      },
      "2026-10-29"
    );
    const result = await commitLearningWorld(
      {
        version: 1,
        ownerId: "student-a",
        petName: "Pebble",
        petAccessory: "ribbon",
        companionAccessory: "none",
        background: "paper",
        desk: "plain",
        wall: "clear",
        placedStickerIds: [],
        shownBadgeIds: [],
        selectedTitleId: null,
        favoriteStickerId: null,
        readiness: [],
      },
      "student-a",
      evaluation
    );
    expect(result.persisted).toBe(true);
    expect(result.error).toBeNull();
    expect(result.world.petName).toBe("Pebble");
    expect(result.world.petAccessory).toBe("ribbon");

    const sealed = window.localStorage.getItem(SEALED_PRIVATE_KEY) ?? "";
    expect(sealed.length).toBeGreaterThan(0);
    expect(sealed.includes("Pebble")).toBe(false);

    await lockAccountVault();
    expect(readLearningWorld("student-a", evaluation).petName).toBe("");

    await unlockTestVault("student-a");
    const restored = readLearningWorld("student-a", evaluation);
    expect(restored.petName).toBe("Pebble");
    expect(restored.petAccessory).toBe("ribbon");
  });

  it("keeps student A room settings invisible after switching to student B", async () => {
    const evaluation = evaluateLearning(
      {
        ...EMPTY_LEARNING_RECORD,
        notes: [{ id: "n1", quote: "A saved note.", createdAt: "2026-10-01T00:00:00.000Z" }],
      },
      "2026-10-29"
    );
    await unlockTestVault("student-a");
    await commitLearningWorld(
      {
        ...readLearningWorld("student-a", evaluation),
        petName: "OnlyA",
        wall: "notes",
      },
      "student-a",
      evaluation
    );
    await lockAccountVault();

    await unlockTestVault("student-b");
    expect(readLearningWorld("student-b", evaluation).petName).toBe("");
    expect(readLearningWorld("student-b", evaluation).wall).toBe("clear");
    expect(readLearningWorld("student-a", evaluation).petName).toBe("");

    await lockAccountVault();
    await unlockTestVault("student-a");
    expect(readLearningWorld("student-a", evaluation).petName).toBe("OnlyA");
    expect(readLearningWorld("student-a", evaluation).wall).toBe("notes");
  });

  it("does not report persisted when the vault is locked", async () => {
    const evaluation = evaluateLearning(EMPTY_LEARNING_RECORD, "2026-10-29");
    const result = await commitLearningWorld(
      {
        version: 1,
        ownerId: "student-a",
        petName: "Ghost",
        petAccessory: "none",
        companionAccessory: "none",
        background: "paper",
        desk: "plain",
        wall: "clear",
        placedStickerIds: [],
        shownBadgeIds: [],
        selectedTitleId: null,
        favoriteStickerId: null,
        readiness: [],
      },
      "student-a",
      evaluation
    );
    expect(result.persisted).toBe(false);
    expect(result.error).toMatch(/locked/i);
    await unlockTestVault("student-a");
    expect(readLearningWorld("student-a", evaluation).petName).toBe("");
  });

  it("queues a sealed write that survives a slow flush", async () => {
    await unlockTestVault("student-a");
    const evaluation = evaluateLearning(EMPTY_LEARNING_RECORD, "2026-10-29");
    writeLearningWorld(
      {
        ...readLearningWorld("student-a", evaluation),
        petName: "Slow",
      },
      "student-a",
      evaluation
    );
    await flushAccountVault();
    await lockAccountVault();
    await unlockTestVault("student-a");
    expect(readLearningWorld("student-a", evaluation).petName).toBe("Slow");
  });
});
