import { afterEach, describe, expect, it } from "vitest";
import {
  buildQuickIntake,
  canMakePlan,
  chapterCount,
  cleanSubjects,
  clearFirstRunDraft,
  DEFAULT_CHAPTER_COUNT,
  examDateFromMonth,
  FIRST_RUN_DRAFT_KEY,
  monthLabel,
  readFirstRunDraft,
  saveFirstRunDraft,
  suggestedExamMonth,
  upcomingMonths,
} from "../first-run";
import { createRoadmapRecord } from "@/lib/roadmap/persist";

describe("first-run setup", () => {
  afterEach(() => window.localStorage.clear());

  it("lists the next months, starting next month, across the year end", () => {
    const months = upcomingMonths("2026-11-03", 4);
    expect(months).toEqual(["2026-12", "2027-01", "2027-02", "2027-03"]);
    expect(monthLabel("2027-03")).toBe("March 2027");
  });

  it("suggests the usual exam month", () => {
    // Boards start mid-February, so the plan finishes by 1 February.
    expect(suggestedExamMonth("class12", "2026-11-03")).toBe("2027-02");
    expect(suggestedExamMonth("neet", "2026-11-03")).toBe("2027-05");
    // Close to the exam still gets this year's date (a short plan is better than none).
    expect(suggestedExamMonth("jee", "2026-12-20")).toBe("2027-01");
    expect(suggestedExamMonth("class12", "2027-01-10")).toBe("2027-02");
    // Less than a week before the 1st: that month isn't offered.
    expect(upcomingMonths("2026-12-28", 2)).toEqual(["2027-02", "2027-03"]);
    expect(suggestedExamMonth("college", "2026-11-03")).toBe("2027-02");
  });

  it("cleans subject names: trims, removes repeats, caps the list", () => {
    expect(cleanSubjects(["  Physics ", "physics", "", "Organic  Chem"])).toEqual(["Physics", "Organic Chem"]);
    expect(cleanSubjects(Array.from({ length: 12 }, (_, i) => `S${i}`))).toHaveLength(8);
  });

  it("needs an exam, a subject and a future month", () => {
    expect(canMakePlan({ exam: "class12", subjects: ["Physics"], examMonth: "2027-03" }, "2026-11-03")).toBe(true);
    expect(canMakePlan({ exam: "class12", subjects: [], examMonth: "2027-03" }, "2026-11-03")).toBe(false);
    expect(canMakePlan({ exam: "class12", subjects: ["Physics"], examMonth: "2026-10" }, "2026-11-03")).toBe(false);
  });

  it("turns the answers into a 2-hour-a-day plan that the planner accepts", () => {
    const intake = buildQuickIntake({ exam: "class12", subjects: ["Physics", "Anatomy"], examMonth: "2027-03" });
    expect(intake.examName).toBe("Class 12");
    expect(intake.examDate).toBe(examDateFromMonth("2027-03"));
    expect(intake.dailyHours).toBe(2);
    expect(intake.subjects.map((s) => s.name)).toEqual(["Physics", "Anatomy"]);
    expect(intake.subjects[0].chapters).toHaveLength(chapterCount("class12", "Physics"));
    expect(intake.subjects[1].chapters).toHaveLength(DEFAULT_CHAPTER_COUNT);
    const record = createRoadmapRecord({ userId: "u1", intake, today: "2026-11-03" });
    const sessions = record.plan.days.flatMap((day) => day.sessions).filter((s) => s.kind === "study");
    expect(sessions.length).toBeGreaterThan(0);
    expect(record.plan.examDate).toBe("2027-03-01");
  });

  it("keeps subjects with Hindi names apart", () => {
    const intake = buildQuickIntake({ exam: "class10", subjects: ["हिंदी", "संस्कृत"], examMonth: "2027-02" });
    expect(new Set(intake.subjects.map((s) => s.id)).size).toBe(2);
    const record = createRoadmapRecord({ userId: "u1", intake, today: "2026-11-03" });
    const planned = new Set(
      record.plan.days.flatMap((day) => day.sessions).map((s) => s.subjectName).filter(Boolean)
    );
    expect(planned).toEqual(new Set(["हिंदी", "संस्कृत"]));
  });

  it("keeps the answers on the device until the plan is made, and rejects bad data", () => {
    const now = Date.parse("2026-11-03T10:00:00Z");
    saveFirstRunDraft({ exam: "neet", subjects: ["Biology"], examMonth: "2027-05" }, "student-a", now);
    expect(readFirstRunDraft("student-a", "2026-11-03", now)).toEqual({ exam: "neet", subjects: ["Biology"], examMonth: "2027-05" });
    // Another student on the same phone never gets these answers.
    expect(readFirstRunDraft("student-b", "2026-11-03", now)).toBeNull();
    // Once the exam month has come, the answers are no use.
    expect(readFirstRunDraft("student-a", "2027-05-01", now)).toBeNull();
    // Over a day old: dropped.
    expect(readFirstRunDraft("student-a", "2026-11-04", now + 25 * 60 * 60 * 1000)).toBeNull();
    expect(window.localStorage.getItem(FIRST_RUN_DRAFT_KEY)).toBeNull();

    saveFirstRunDraft({ exam: "neet", subjects: ["Biology"], examMonth: "2027-05" }, "student-a", now);
    clearFirstRunDraft();
    expect(readFirstRunDraft("student-a", undefined, now)).toBeNull();
    window.localStorage.setItem(
      FIRST_RUN_DRAFT_KEY,
      JSON.stringify({ exam: "hack", subjects: ["x"], examMonth: "2027-05", owner: "student-a", savedAt: now })
    );
    expect(readFirstRunDraft("student-a", undefined, now)).toBeNull();
    window.localStorage.setItem(FIRST_RUN_DRAFT_KEY, "{not json");
    expect(readFirstRunDraft("student-a", undefined, now)).toBeNull();
  });
});
