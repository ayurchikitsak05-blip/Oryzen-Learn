import { describe, expect, it } from "vitest";
import {
  BODY_QUESTIONS,
  scoreBody,
  STUDY_QUESTIONS,
  studySettings,
  STYLE_DISCLAIMER,
  styleFromScores,
  type BodyAnswers,
} from "../style-quiz";

function answerAll(pick: (index: number) => "Vata" | "Pitta" | "Kapha"): BodyAnswers {
  return Object.fromEntries(BODY_QUESTIONS.map((q, i) => [q.id, pick(i)]));
}

describe("study style questionnaire", () => {
  it("has 26 questions about the body and 12 about studying, each with clear answers", () => {
    expect(BODY_QUESTIONS).toHaveLength(26);
    expect(STUDY_QUESTIONS).toHaveLength(12);
    expect(new Set([...BODY_QUESTIONS, ...STUDY_QUESTIONS].map((q) => q.id)).size).toBe(38);
    for (const q of BODY_QUESTIONS) {
      expect(Object.values(q.options).every((text) => text.length > 5)).toBe(true);
    }
  });

  it("uses plain English: no Sanskrit terms or the word Prakriti in what students read", () => {
    const shown = [
      ...BODY_QUESTIONS.flatMap((q) => [q.topic, q.prompt, ...Object.values(q.options)]),
      ...STUDY_QUESTIONS.flatMap((q) => [q.topic, q.prompt, ...q.options.map((o) => o.label)]),
      STYLE_DISCLAIMER,
    ];
    const text = shown.join(" ").toLowerCase();
    for (const word of ["prakriti", "dosha", "vata", "pitta", "kapha", "agni", "dhriti", "smriti", "dinacharya"]) {
      expect(text).not.toContain(word);
    }
  });

  it("scores the body answers into a mix that adds up to 100", () => {
    const scores = scoreBody(answerAll((i) => (i < 18 ? "Vata" : i < 22 ? "Pitta" : "Kapha")));
    expect(scores.Vata + scores.Pitta + scores.Kapha).toBe(100);
    expect(scores.Vata).toBeGreaterThan(60);
    expect(styleFromScores(scores).name).toBe("Spark & Sprint");
  });

  it("names mixes and balanced results", () => {
    const mixed = scoreBody(answerAll((i) => (i % 2 === 0 ? "Pitta" : "Kapha")));
    expect(styleFromScores(mixed).profileId).toBe("pitta_kapha");
    // 12/8/6 → 46/31/23: within 15 points, so a mix (matches the saved profile)
    expect(styleFromScores({ Vata: 46, Pitta: 31, Kapha: 23 }).profileId).toBe("vata_pitta");
    const even = scoreBody(answerAll((i) => (["Vata", "Pitta", "Kapha"] as const)[i % 3]));
    expect(styleFromScores(even).profileId).toBe("balanced");
  });

  it("turns study answers into settings, with tips for what the student said", () => {
    const style = styleFromScores(scoreBody(answerAll(() => "Kapha")));
    const settings = studySettings(
      {
        "s-focus": "15", "s-break": "10", "s-hours": "180", "s-time": "morning", "s-start": "hard",
        "s-distraction": "phone", "s-explain": "story", "s-notes": "mind_map", "s-recall": "little",
        "s-exam": "very", "s-sound": "rain", "s-help": "coach",
      },
      style
    );
    expect(settings).toMatchObject({ sprintMinutes: 15, breakMinutes: 10, dailyMinutes: 180, explainFirst: "story", helper: "coach" });
    expect(settings.focusSound).not.toBe("silence");
    expect(settings.tips.join(" ")).toMatch(/Can't get started/);
    expect(settings.tips.join(" ")).toMatch(/14416/);
    expect(settings.tips.length).toBeLessThanOrEqual(5);
  });

  it("falls back to the style's own timings when study answers are missing", () => {
    const style = styleFromScores(scoreBody(answerAll(() => "Pitta")));
    expect(studySettings({}, style)).toMatchObject({ sprintMinutes: 45, focusSound: "silence" });
  });
});
