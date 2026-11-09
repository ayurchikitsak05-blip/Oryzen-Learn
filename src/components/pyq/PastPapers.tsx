"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ui } from "@/components/ui/classes";
import { PAST_PAPER_EXAMS, rankSubject, valueLabel, type Band, type PastPaperExamId } from "@/lib/pyq/weightage";

const EXAM_KEY = "oryzen_past_papers_exam_v1";

const BAND_LABEL: Record<Band, string> = { high: "Comes most", medium: "Comes often", low: "Comes less" };
const BAND_CLASS: Record<Band, string> = {
  high: "bg-accent",
  medium: "bg-[color-mix(in_srgb,var(--accent)_55%,transparent)]",
  low: "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]",
};

/** Past papers: which chapters come most, for NEET, JEE Main and CBSE 10/12. No questions copied. */
export function PastPapers() {
  const [examId, setExamId] = useState<PastPaperExamId>("neet");
  const [subjectName, setSubjectName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EXAM_KEY) as PastPaperExamId | null;
      if (saved && PAST_PAPER_EXAMS.some((exam) => exam.id === saved)) setExamId(saved);
    } catch {
      // Private mode: start from the default.
    }
  }, []);

  const exam = PAST_PAPER_EXAMS.find((item) => item.id === examId) ?? PAST_PAPER_EXAMS[0];
  const subject = exam.subjects.find((item) => item.name === subjectName) ?? exam.subjects[0];
  const ranked = useMemo(() => rankSubject(exam, subject), [exam, subject]);

  const pickExam = (id: PastPaperExamId) => {
    setExamId(id);
    setSubjectName(null);
    try {
      window.localStorage.setItem(EXAM_KEY, id);
    } catch {
      // Not remembered in private mode.
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="past-papers">
      <header>
        <h1 className={`${ui.heading} text-3xl`}>What comes most in exams</h1>
        <p className="mt-2 text-sm text-muted">
          Which chapters past papers ask about most, so you can give them more time. Start with &ldquo;Comes most&rdquo;,
          but don&apos;t skip the rest: every chapter can be asked.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Exam">
        {PAST_PAPER_EXAMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === exam.id}
            onClick={() => pickExam(item.id)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${item.id === exam.id ? ui.selected : ui.idle}`}
            data-testid={`pyq-exam-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Subject">
        {exam.subjects.map((item) => (
          <button
            key={item.name}
            type="button"
            role="tab"
            aria-selected={item.name === subject.name}
            onClick={() => setSubjectName(item.name)}
            className={`min-h-10 rounded-xl border px-3 text-sm ${item.name === subject.name ? ui.selected : ui.idle}`}
          >
            {item.name}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">{exam.basis}</p>

      <ol className="space-y-2" data-testid="pyq-list" aria-label={`${exam.label} ${subject.name}, most asked first`}>
        {ranked.map((item) => (
          <li key={item.name} className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-sm font-semibold text-heading">{item.name}</p>
              <p className="shrink-0 text-xs text-muted">{valueLabel(exam, item)}</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-beige-2" aria-hidden="true">
              <div className={`h-full rounded-full ${BAND_CLASS[item.band]}`} style={{ width: `${Math.max(6, Math.round(item.share * 100))}%` }} />
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              <span>{BAND_LABEL[item.band]}</span>
              {item.everyYear ? <span className="font-medium text-accent">Asked every year {exam.years?.[0]}–{exam.years?.[exam.years.length - 1]}</span> : null}
              {item.years ? <span>({item.years.join(", ")})</span> : null}
            </p>
            {item.chapters ? <p className="mt-1 text-xs text-muted">{item.chapters}</p> : null}
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted">
        Source:{" "}
        <a href={exam.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {exam.sourceName}
        </a>
        . Past papers guide your time; they don&apos;t promise what the next paper will ask.
      </p>
    </main>
  );
}
