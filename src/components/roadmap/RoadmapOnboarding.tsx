"use client";

import React from "react";
import { choiceClass, ui } from "@/components/ui/classes";
import { createId, emptyCommitment, PREP_LEVELS, WEEKDAY_OPTIONS } from "@/lib/roadmap/defaults";
import { formatClock, parseClock } from "@/lib/roadmap/time";
import type { RoadmapIntake, RoadmapSubject } from "@/lib/roadmap/types";

const STEPS = [
  {
    title: "When is your exam?",
    prompt: "Start with the date you need to be ready. The plan counts backward from there.",
  },
  {
    title: "Which subjects?",
    prompt: "Add every subject on this exam. You can change the list later.",
  },
  {
    title: "Which chapters still need work?",
    prompt: "Difficulty and remaining time decide what comes first. Leave finished chapters out.",
  },
  {
    title: "How prepared do you feel?",
    prompt: "This only scales the remaining work. It is not a judgment of ability.",
  },
  {
    title: "How many hours can you study each day?",
    prompt: "Use a number you can keep. Honest hours make a plan you can follow.",
  },
  {
    title: "What already owns part of your week?",
    prompt: "Classes, sports, or family time stay blocked. Those hours will not get study sessions.",
  },
  {
    title: "When do you prefer to study — and sleep?",
    prompt: "Sessions stay inside your study hours and outside your sleep window.",
  },
] as const;

function ClockField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <label className="block">
      <span className={ui.label}>{label}</span>
      <input
        id={id}
        type="time"
        value={formatClock(value)}
        onChange={(event) => {
          const parsed = parseClock(event.target.value);
          if (parsed != null) onChange(parsed);
        }}
        className={ui.input}
      />
    </label>
  );
}

export default function RoadmapOnboarding({
  intake,
  onChange,
  onGenerate,
  step,
  onStepChange,
}: {
  intake: RoadmapIntake;
  onChange: (intake: RoadmapIntake) => void;
  onGenerate: () => void;
  step: number;
  onStepChange: (step: number) => void;
}) {
  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;
  const canNext =
    step === 0
      ? Boolean(intake.examDate)
      : step === 1
        ? intake.subjects.length > 0
        : step === 2
          ? intake.subjects.some((subject) => subject.chapters.length > 0)
          : step === 4
            ? intake.dailyHours > 0
            : true;

  const updateSubject = (subjectId: string, patch: Partial<RoadmapSubject>) => {
    onChange({
      ...intake,
      subjects: intake.subjects.map((subject) =>
        subject.id === subjectId ? { ...subject, ...patch } : subject
      ),
    });
  };

  return (
    <section className={`${ui.cardPad} mt-8`} data-testid="roadmap-onboarding">
      <p className={ui.eyebrow}>
        Step {step + 1} of {STEPS.length}
      </p>
      <h2 className={`${ui.heading} mt-3 text-2xl`}>{current.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{current.prompt}</p>

      <div className="mt-6 space-y-4">
        {step === 0 && (
          <label className="block">
            <span className={ui.label}>Exam date</span>
            <input
              data-testid="roadmap-exam-date"
              type="date"
              value={intake.examDate}
              onChange={(event) => onChange({ ...intake, examDate: event.target.value })}
              className={ui.input}
            />
          </label>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {intake.subjects.map((subject) => (
              <div key={subject.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3 sm:flex-row">
                <input
                  value={subject.name}
                  aria-label="Subject name"
                  onChange={(event) => updateSubject(subject.id, { name: event.target.value })}
                  className={`${ui.input} flex-1`}
                />
                <label className="sm:w-40">
                  <span className={ui.label}>Exam importance</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    aria-label={`${subject.name} importance`}
                    value={subject.examImportance}
                    onChange={(event) =>
                      updateSubject(subject.id, { examImportance: Number(event.target.value) })
                    }
                    className={ui.input}
                  />
                </label>
                <button
                  type="button"
                  className={ui.ghost}
                  onClick={() =>
                    onChange({
                      ...intake,
                      subjects: intake.subjects.filter((row) => row.id !== subject.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={ui.secondary}
              onClick={() =>
                onChange({
                  ...intake,
                  subjects: [
                    ...intake.subjects,
                    {
                      id: createId("sub"),
                      name: "New subject",
                      examImportance: 3,
                      chapters: [{ id: createId("ch"), name: "Chapter 1", difficulty: 3, remainingMinutes: 120 }],
                    },
                  ],
                })
              }
            >
              Add subject
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            {intake.subjects.map((subject) => (
              <div key={subject.id}>
                <h3 className={`${ui.heading} text-lg`}>{subject.name}</h3>
                <div className="mt-2 space-y-2">
                  {subject.chapters.map((chapter) => (
                    <div key={chapter.id} className="grid gap-2 rounded-2xl border border-line p-3 md:grid-cols-12">
                      <input
                        value={chapter.name}
                        aria-label={`${subject.name} chapter`}
                        onChange={(event) =>
                          updateSubject(subject.id, {
                            chapters: subject.chapters.map((row) =>
                              row.id === chapter.id ? { ...row, name: event.target.value } : row
                            ),
                          })
                        }
                        className={`${ui.input} md:col-span-5`}
                      />
                      <label className="md:col-span-3">
                        <span className={ui.label}>Difficulty 1–5</span>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={chapter.difficulty}
                          aria-label={`${chapter.name} difficulty`}
                          onChange={(event) =>
                            updateSubject(subject.id, {
                              chapters: subject.chapters.map((row) =>
                                row.id === chapter.id
                                  ? { ...row, difficulty: Number(event.target.value) }
                                  : row
                              ),
                            })
                          }
                          className={ui.input}
                        />
                      </label>
                      <label className="md:col-span-3">
                        <span className={ui.label}>Minutes left</span>
                        <input
                          type="number"
                          min={0}
                          step={15}
                          value={chapter.remainingMinutes}
                          aria-label={`${chapter.name} remaining minutes`}
                          onChange={(event) =>
                            updateSubject(subject.id, {
                              chapters: subject.chapters.map((row) =>
                                row.id === chapter.id
                                  ? { ...row, remainingMinutes: Number(event.target.value) }
                                  : row
                              ),
                            })
                          }
                          className={ui.input}
                        />
                      </label>
                      <button
                        type="button"
                        className={`${ui.ghost} md:col-span-1`}
                        onClick={() =>
                          updateSubject(subject.id, {
                            chapters: subject.chapters.filter((row) => row.id !== chapter.id),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${ui.secondary} mt-2`}
                  onClick={() =>
                    updateSubject(subject.id, {
                      chapters: [
                        ...subject.chapters,
                        {
                          id: createId("ch"),
                          name: "New chapter",
                          difficulty: 3,
                          remainingMinutes: 120,
                        },
                      ],
                    })
                  }
                >
                  Add chapter
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {PREP_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => onChange({ ...intake, prepLevel: level.value })}
                className={choiceClass(intake.prepLevel === level.value)}
              >
                <span>
                  <span className="block font-medium text-heading">{level.label}</span>
                  <span className="mt-1 block text-sm text-muted">{level.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 4 && (
          <label className="block max-w-xs">
            <span className={ui.label}>Daily study hours</span>
            <input
              data-testid="roadmap-daily-hours"
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={intake.dailyHours}
              onChange={(event) => onChange({ ...intake, dailyHours: Number(event.target.value) })}
              className={ui.input}
            />
          </label>
        )}

        {step === 5 && (
          <div className="space-y-3">
            {intake.commitments.length === 0 && (
              <p className={ui.empty}>No weekly commitments yet. Add one if evenings or weekends are already taken.</p>
            )}
            {intake.commitments.map((row) => (
              <div key={row.id} className="grid gap-2 rounded-2xl border border-line p-3 md:grid-cols-12">
                <input
                  value={row.label}
                  aria-label="Commitment name"
                  onChange={(event) =>
                    onChange({
                      ...intake,
                      commitments: intake.commitments.map((item) =>
                        item.id === row.id ? { ...item, label: event.target.value } : item
                      ),
                    })
                  }
                  className={`${ui.input} md:col-span-4`}
                />
                <select
                  aria-label="Commitment day"
                  value={row.weekday}
                  onChange={(event) =>
                    onChange({
                      ...intake,
                      commitments: intake.commitments.map((item) =>
                        item.id === row.id
                          ? { ...item, weekday: Number(event.target.value) as typeof row.weekday }
                          : item
                      ),
                    })
                  }
                  className={`${ui.input} md:col-span-2`}
                >
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="md:col-span-2">
                  <ClockField
                    id={`${row.id}-start`}
                    label="Starts"
                    value={row.startMinutes}
                    onChange={(startMinutes) =>
                      onChange({
                        ...intake,
                        commitments: intake.commitments.map((item) =>
                          item.id === row.id ? { ...item, startMinutes } : item
                        ),
                      })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <ClockField
                    id={`${row.id}-end`}
                    label="Ends"
                    value={row.endMinutes}
                    onChange={(endMinutes) =>
                      onChange({
                        ...intake,
                        commitments: intake.commitments.map((item) =>
                          item.id === row.id ? { ...item, endMinutes } : item
                        ),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className={`${ui.ghost} md:col-span-2`}
                  onClick={() =>
                    onChange({
                      ...intake,
                      commitments: intake.commitments.filter((item) => item.id !== row.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={ui.secondary}
              onClick={() => onChange({ ...intake, commitments: [...intake.commitments, emptyCommitment()] })}
            >
              Add commitment
            </button>
          </div>
        )}

        {step === 6 && (
          <div className="grid gap-4 md:grid-cols-2">
            <ClockField
              id="preferred-start"
              label="Preferred study start"
              value={intake.preferredStudyHours.startMinutes}
              onChange={(startMinutes) =>
                onChange({
                  ...intake,
                  preferredStudyHours: { ...intake.preferredStudyHours, startMinutes },
                })
              }
            />
            <ClockField
              id="preferred-end"
              label="Preferred study end"
              value={intake.preferredStudyHours.endMinutes}
              onChange={(endMinutes) =>
                onChange({
                  ...intake,
                  preferredStudyHours: { ...intake.preferredStudyHours, endMinutes },
                })
              }
            />
            <ClockField
              id="sleep-start"
              label="Sleep starts"
              value={intake.sleepWindow.startMinutes}
              onChange={(startMinutes) =>
                onChange({ ...intake, sleepWindow: { ...intake.sleepWindow, startMinutes } })
              }
            />
            <ClockField
              id="sleep-end"
              label="Sleep ends"
              value={intake.sleepWindow.endMinutes}
              onChange={(endMinutes) =>
                onChange({ ...intake, sleepWindow: { ...intake.sleepWindow, endMinutes } })
              }
            />
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {step > 0 && (
          <button type="button" className={ui.secondary} onClick={() => onStepChange(step - 1)}>
            Back
          </button>
        )}
        {!last && (
          <button
            type="button"
            data-testid="roadmap-next"
            className={ui.primary}
            disabled={!canNext}
            onClick={() => onStepChange(step + 1)}
          >
            Continue
          </button>
        )}
        {last && (
          <button
            type="button"
            data-testid="roadmap-generate"
            className={ui.primary}
            onClick={onGenerate}
          >
            Build my study roadmap
          </button>
        )}
      </div>
    </section>
  );
}
