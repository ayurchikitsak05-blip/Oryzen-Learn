import { describe, expect, it } from "vitest";
import { ALL_TIPS, indiaDayNumber, tipForToday } from "../tips";
import { TECHNIQUES, techniquesFor } from "@/lib/study/techniques";

describe("daily thought", () => {
  it("is the same all day and changes at Indian midnight", () => {
    const morning = new Date("2026-11-08T03:00:00Z");
    const evening = new Date("2026-11-08T17:00:00Z"); // 22:30 IST, same day
    const next = new Date("2026-11-08T19:00:00Z"); // 00:30 IST, next day
    expect(tipForToday("vata", morning)).toBe(tipForToday("vata", evening));
    expect(indiaDayNumber(next)).toBe(indiaDayNumber(evening) + 1);
  });

  it("uses the student's style most days, and general tips otherwise", () => {
    const styleTips = [...ALL_TIPS.spark];
    let styled = 0;
    for (let d = 0; d < 30; d += 1) {
      const tip = tipForToday("vata", new Date(Date.UTC(2026, 10, 1 + d, 6)));
      if (styleTips.includes(tip)) styled += 1;
    }
    expect(styled).toBeGreaterThan(15);
    expect(ALL_TIPS.all).toContain(tipForToday(null, new Date("2026-11-08T06:00:00Z")));
  });
});

describe("study techniques", () => {
  it("suggests at least three techniques for every one of the 7 styles", () => {
    for (const id of ["vata", "pitta", "kapha", "vata_pitta", "pitta_kapha", "vata_kapha", "balanced"] as const) {
      const { suited, others } = techniquesFor(id);
      expect(suited.length).toBeGreaterThanOrEqual(3);
      expect(suited.length + others.length).toBe(TECHNIQUES.length);
    }
    expect(techniquesFor(null).suited).toEqual([]);
  });
});
