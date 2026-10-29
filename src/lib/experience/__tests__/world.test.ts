import { beforeEach, describe, expect, it } from "vitest";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";
import { EMPTY_LEARNING_RECORD } from "../record";
import { evaluateLearning } from "../rewards";
import { readLearningWorld, writeLearningWorld } from "../world";

describe("learning world", () => {
  beforeEach(() => {
    discardAccountVault();
    window.localStorage.clear();
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
});
