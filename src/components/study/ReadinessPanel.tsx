"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ui } from "@/components/ui/classes";
import type { RoadmapRecord } from "@/lib/roadmap/types";
import {
  CHAPTER_LEVELS,
  CHAPTER_STAGES,
  levelInfo,
  nextStepFor,
  readinessSummary,
  stagesDone,
  type ChapterLevel,
} from "@/lib/study/readiness";

/** Four small steps, filled up to where the chapter is. */
function StageTrack({ level }: { level: ChapterLevel }) {
  const done = stagesDone(level);
  return (
    <ol className="flex items-center gap-1" aria-label={`${done} of ${CHAPTER_STAGES.length} steps done`}>
      {CHAPTER_STAGES.map((stage, index) => (
        <li key={stage} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              index < done ? "bg-heading text-surface" : index === done ? "border border-heading text-heading" : "bg-beige-2 text-muted"
            }`}
          >
            {stage}
          </span>
          {index < CHAPTER_STAGES.length - 1 ? <span aria-hidden className="text-[10px] text-muted">›</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * "Where you stand" on the Study Roadmap: exam readiness from the student's own chapter ratings,
 * days left, the one chapter to do next and a clear next step for every chapter.
 */
export default function ReadinessPanel({
  record,
  today,
  onChange,
}: {
  record: RoadmapRecord;
  today: string;
  onChange: (record: RoadmapRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => readinessSummary(record, today), [record, today]);
  const examLabel = record.intake.examName.trim() || "the exam";

  const setLevel = (chapterId: string, level: ChapterLevel) => {
    onChange({
      ...record,
      readiness: { ...(record.readiness ?? {}), [chapterId]: level },
      updatedAt: new Date().toISOString(),
    });
  };

  if (summary.chapters.length === 0) return null;
  const next = summary.doNext;
  const nextStep = next ? nextStepFor(next.level) : null;

  return (
    <section className={`${ui.cardPad} space-y-4`} data-testid="readiness-panel" aria-labelledby="readiness-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={ui.eyebrow}>Where you stand</p>
          <h2 id="readiness-title" className={`${ui.heading} mt-1 text-2xl`}>
            <span data-testid="readiness-percent">{summary.percent}%</span> ready for {examLabel}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {summary.daysLeft} day{summary.daysLeft === 1 ? "" : "s"} left · {summary.counts.exam_ready} of {summary.chapters.length}{" "}
            chapter{summary.chapters.length === 1 ? "" : "s"} exam ready
            {summary.daysPerChapter != null ? ` · about ${summary.daysPerChapter} day${summary.daysPerChapter === 1 ? "" : "s"} per chapter left` : ""}
          </p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-beige-2" aria-hidden>
        <div className="h-full rounded-full bg-heading" style={{ width: `${summary.percent}%` }} />
      </div>
      <p className="text-xs text-muted">
        Based on how you rate each chapter, weighted by how much it counts in the exam. Be honest: it only helps you.
      </p>

      {next && nextStep ? (
        <div className="rounded-2xl bg-beige-2 px-4 py-3" data-testid="readiness-do-next">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Do next</p>
          <p className="mt-1 text-sm font-semibold text-heading">
            {next.subjectName}: {next.chapterName}
          </p>
          <p className="text-sm text-ink">
            {nextStep.label}. {nextStep.detail}
          </p>
          <Link href={nextStep.href} className={`${ui.secondary} mt-2 inline-flex`}>
            {nextStep.label}
          </Link>
        </div>
      ) : (
        <p className={ui.success}>Every chapter is exam ready. Keep them fresh with a weekly card recap.</p>
      )}

      <button
        type="button"
        className={ui.ghost}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="readiness-toggle"
      >
        {open ? "Hide chapters" : "Rate my chapters"}
      </button>

      {open ? (
        <ul className="space-y-3" data-testid="readiness-chapters">
          {summary.chapters.map((chapter) => {
            const step = nextStepFor(chapter.level);
            return (
              <li key={chapter.chapterId} className="space-y-2 rounded-2xl border border-line px-4 py-3" data-testid="readiness-chapter">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-heading">
                    {chapter.subjectName}: {chapter.chapterName}
                  </p>
                  <StageTrack level={chapter.level} />
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`How ready is ${chapter.chapterName}?`}>
                  {CHAPTER_LEVELS.map((level) => {
                    const picked = chapter.level === level.id;
                    return (
                      <button
                        key={level.id}
                        type="button"
                        role="radio"
                        aria-checked={picked}
                        title={level.hint}
                        onClick={() => setLevel(chapter.chapterId, level.id)}
                        className={`min-h-[36px] rounded-full border px-3 text-xs font-medium ${picked ? ui.selected : ui.idle}`}
                        data-testid={`readiness-level-${level.id}`}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">
                  {levelInfo(chapter.level).hint}. Next:{" "}
                  <Link href={step.href} className="font-medium text-accent underline-offset-4 hover:underline">
                    {step.label}
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
