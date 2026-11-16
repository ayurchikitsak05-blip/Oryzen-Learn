/**
 * "Ask your own AI" (owner, 15 Nov 2026). Copies the student's progress as a ready-made question
 * for ChatGPT or Gemini, so they get personal coaching at no cost to ORYZEN. Contains no name,
 * email or account details: only the exam, the dates and how the chapters stand.
 */
import { levelInfo, readinessSummary } from "@/lib/study/readiness";
import type { RoadmapRecord } from "@/lib/roadmap/types";

export type OwnAiGoal = "plan" | "quiz";

export const OWN_AI_GOALS: readonly { id: OwnAiGoal; label: string }[] = [
  { id: "plan", label: "Plan my next 7 days" },
  { id: "quiz", label: "Quiz me on my weakest chapter" },
];

export function ownAiPrompt(
  record: Pick<RoadmapRecord, "intake" | "readiness">,
  today: string,
  goal: OwnAiGoal
): string {
  const summary = readinessSummary(record, today);
  const exam = record.intake.examName.trim() || "my exam";
  const chapters = summary.chapters
    .slice(0, 40)
    .map((row) => `- ${row.subjectName}: ${row.chapterName}: ${levelInfo(row.level).label}`)
    .join("\n");
  const weakest = summary.doNext ? `${summary.doNext.subjectName}: ${summary.doNext.chapterName}` : null;
  const lines = [
    `I'm a student in India preparing for ${exam}, which is ${summary.daysLeft} day${summary.daysLeft === 1 ? "" : "s"} away.`,
    `I can study about ${record.intake.dailyHours > 0 ? record.intake.dailyHours : "a few"} hours a day.`,
    `My own rating of each chapter (Not started / Shaky / Getting there / Exam ready):`,
    chapters || "- (no chapters added yet)",
    `Overall I'm about ${summary.percent}% exam ready.`,
    "",
  ];
  if (goal === "plan") {
    lines.push(
      "Please make me a simple day-by-day plan for the next 7 days.",
      weakest ? `Start with ${weakest}, then the other Shaky and Not started chapters that count most.` : "",
      "Keep each day realistic, include one short revision slot every day, and keep one evening light.",
      "Use short bullet points."
    );
  } else {
    lines.push(
      weakest
        ? `Please quiz me on ${weakest}: ask 5 exam-style questions one at a time, wait for my answer, then tell me if I was right and why.`
        : "Please quiz me on my weakest chapter: ask 5 exam-style questions one at a time, wait for my answer, then tell me if I was right and why.",
      "Keep the questions at my exam's level."
    );
  }
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim();
}

/** Where students can paste it. Opened in a new tab; nothing is sent from ORYZEN. */
export const OWN_AI_APPS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
] as const;
