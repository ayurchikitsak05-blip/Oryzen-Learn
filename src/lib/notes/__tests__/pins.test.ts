import { afterEach, describe, expect, it } from "vitest";
import { isPinned, MAX_PINS, pinNote, readPins, unpinNote } from "../pins";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

describe("sticky notes", () => {
  afterEach(() => {
    discardAccountVault();
    window.localStorage.clear();
  });

  it("pins up to 5 notes, newest first, and unpins", async () => {
    await unlockTestVault("student-a");
    for (let i = 1; i <= MAX_PINS; i += 1) {
      expect(pinNote({ id: `n${i}`, title: `Note ${i}`, body: "x" }, "student-a")).toBe(true);
    }
    expect(pinNote({ id: "n6", title: "Too many", body: "x" }, "student-a")).toBe(false);
    expect(readPins("student-a").map((p) => p.id)).toEqual(["n5", "n4", "n3", "n2", "n1"]);
    unpinNote("n3", "student-a");
    expect(isPinned("n3", "student-a")).toBe(false);
    expect(pinNote({ id: "n6", title: "Now fits", body: "x" }, "student-a")).toBe(true);
  });
});
