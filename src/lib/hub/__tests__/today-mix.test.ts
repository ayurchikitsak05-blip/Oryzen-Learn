import { describe, expect, it } from "vitest";
import { buildTodayMix, plainText } from "../today-mix";

const base = { today: "2026-11-27", revisionDue: null, noteCount: 0, lastLecture: null, notes: [], fallbackTip: "Study in short blocks." };

describe("Today's mix (no AI)", () => {
  it("guides a brand-new student to their first card, a lecture and a tip", () => {
    const mix = buildTodayMix(base);
    expect(mix.map((item) => item.kind)).toEqual(["revision", "lecture", "note"]);
    expect(mix[0].title).toBe("Make your first revision cards");
    expect(mix[1].href).toBe("/video");
    expect(mix[2].kicker).toBe("Idea of the day");
  });

  it("uses the student's own cards, lecture and notes", () => {
    const mix = buildTodayMix({
      ...base,
      revisionDue: 5,
      noteCount: 12,
      lastLecture: { videoId: "vo4pMVb0R6M", title: "Intro to Psychology", topics: 13 },
      notes: [{ title: "Newton's laws", body: "**F = ma**. Force equals mass times acceleration." }],
    });
    expect(mix[0].title).toBe("5 cards due today");
    expect(mix[1].href).toBe("/video?v=vo4pMVb0R6M");
    expect(mix[1].detail).toContain("13 topics");
    expect(mix[2].title).toBe("Newton's laws");
    expect(mix[2].detail).toBe("F = ma. Force equals mass times acceleration.");
  });

  it("picks the same note all day and a different one on other days", () => {
    const notes = Array.from({ length: 9 }, (_, i) => ({ title: `Note number ${i}`, body: `Body of note ${i} with words` }));
    const a = buildTodayMix({ ...base, notes, today: "2026-11-27" })[2].title;
    expect(buildTodayMix({ ...base, notes, today: "2026-11-27" })[2].title).toBe(a);
    const others = ["2026-11-28", "2026-11-29", "2026-11-30"].map((today) => buildTodayMix({ ...base, notes, today })[2].title);
    expect(others.some((title) => title !== a)).toBe(true);
  });

  it("says all caught up when nothing is due", () => {
    expect(buildTodayMix({ ...base, revisionDue: 0, noteCount: 4 })[0].title).toBe("All caught up");
  });

  it("strips formatting from notes", () => {
    expect(plainText("## Title\n- **bold** `code`")).toBe("Title bold code");
  });
});
