import { describe, expect, it, vi } from "vitest";
import { countdownLine, countdownView, daysUntil, drawWallpaper, formatExamDate } from "../wallpaper";

describe("exam countdown", () => {
  it("counts whole days to the exam", () => {
    expect(daysUntil("2027-02-15", "2026-11-08")).toBe(99);
    expect(daysUntil("2026-11-08", "2026-11-08")).toBe(0);
    expect(daysUntil("2026-11-01", "2026-11-08")).toBe(0);
    expect(countdownLine(1)).toBe("1 day to go");
    expect(countdownLine(99)).toBe("99 days to go");
    expect(formatExamDate("2027-02-15")).toBe("15 February 2027");
  });

  it("draws the exam, the days left and the thought on the picture", () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: "", font: "", textAlign: "", textBaseline: "",
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => calls.push(text)),
      measureText: (text: string) => ({ width: text.length * 20 }),
    } as unknown as CanvasRenderingContext2D;
    drawWallpaper(ctx, {
      examName: "NEET",
      examDate: "2027-05-02",
      today: "2026-11-08",
      thought: "Small steps every day add up to a finished syllabus.",
      colours: { bg: "#fff", heading: "#000", ink: "#333", accent: "#a50" },
    });
    expect(calls).toContain("NEET");
    expect(calls).toContain("175");
    expect(calls).toContain("days to go");
    expect(calls.join(" ")).toMatch(/finished syllabus/);
  });

  it("says 'about' when only the exam month is known, and keeps showing through that month", () => {
    expect(countdownView("2027-05-01", "2026-11-08", "2027-05")).toMatchObject({
      line: "about 174 days to go",
      dateLabel: "May 2027",
    });
    expect(countdownView("2027-05-01", "2027-05-10", "2027-05")).toMatchObject({ line: "Exam month. You've got this." });
    expect(countdownView("2027-05-01", "2027-06-01", "2027-05")).toBeNull();
    expect(countdownView("2027-05-02", "2027-05-03")).toBeNull();
    expect(countdownView("2027-05-02", "2027-05-02")).toMatchObject({ big: "Today", unit: "Exam day" });
  });
});
