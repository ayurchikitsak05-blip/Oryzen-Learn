"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileUp, Plus } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import {
  canMakePlan,
  cleanSubjects,
  EXAM_OPTIONS,
  examOption,
  monthLabel,
  saveFirstRunDraft,
  suggestedExamMonth,
  upcomingMonths,
  type ExamId,
} from "@/lib/onboarding/first-run";
import { localIsoDate } from "@/lib/roadmap/time";

function chipClass(active: boolean): string {
  return `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
    active ? ui.selected : ui.idle
  }`;
}

/** First run: "Your exam" (step 1) and "Your first book" (step 2). */
export default function WelcomePage() {
  const router = useRouter();
  const [today, setToday] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [exam, setExam] = useState<ExamId | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [extraSubject, setExtraSubject] = useState("");
  const [examMonth, setExamMonth] = useState("");

  useEffect(() => {
    setToday(localIsoDate());
  }, []);

  const months = useMemo(() => (today ? upcomingMonths(today) : []), [today]);
  const option = examOption(exam);
  const offered = cleanSubjects([...(option?.subjects ?? []), ...subjects]);
  const answers = { exam: exam ?? undefined, subjects, examMonth };
  const ready = Boolean(today) && canMakePlan(answers, today);

  const pickExam = (id: ExamId) => {
    setExam(id);
    setSubjects([...(examOption(id)?.preselected ?? [])]);
    if (today) setExamMonth(suggestedExamMonth(id, today));
  };

  const toggleSubject = (name: string) => {
    setSubjects((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  };

  const addSubject = () => {
    const name = extraSubject.trim();
    if (!name) return;
    setSubjects((current) => cleanSubjects([...current, name]));
    setExtraSubject("");
  };

  const finish = (next: string) => {
    if (exam && ready) saveFirstRunDraft({ exam, subjects: cleanSubjects(subjects), examMonth });
    router.push(next);
  };

  return (
    <AppChrome subtitle={step === 1 ? "Your exam" : "Your first book"} showBack={false}>
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-6 md:py-10" data-testid="welcome">
        <div className="flex items-center justify-between">
          <p className={ui.eyebrow}>Step {step} of 2</p>
          <Link href="/hub" className="text-sm font-medium text-muted underline-offset-4 hover:underline" data-testid="welcome-skip">
            Skip
          </Link>
        </div>

        {step === 1 ? (
          <>
            <header>
              <h1 className="font-display text-3xl text-heading">What are you studying for?</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We&apos;ll turn this into a daily plan of about 2 hours. Change it any time.
              </p>
            </header>

            <section aria-labelledby="welcome-exam">
              <h2 id="welcome-exam" className={ui.label}>Class or exam</h2>
              <div className="flex flex-wrap gap-2">
                {EXAM_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={exam === item.id}
                    onClick={() => pickExam(item.id)}
                    className={chipClass(exam === item.id)}
                    data-testid={`welcome-exam-${item.id}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            {exam ? (
              <>
                <section aria-labelledby="welcome-subjects">
                  <h2 id="welcome-subjects" className={ui.label}>Subjects</h2>
                  <div className="flex flex-wrap gap-2">
                    {offered.map((name) => {
                      const active = subjects.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleSubject(name)}
                          className={chipClass(active)}
                        >
                          {active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Add another subject</span>
                      <input
                        type="text"
                        value={extraSubject}
                        maxLength={40}
                        placeholder={exam === "college" ? "Add a subject, e.g. Anatomy" : "Another subject"}
                        onChange={(event) => setExtraSubject(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSubject();
                          }
                        }}
                        className={ui.input}
                        data-testid="welcome-extra-subject"
                      />
                    </label>
                    <button type="button" onClick={addSubject} className={ui.secondary} data-testid="welcome-add-subject">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add
                    </button>
                  </div>
                </section>

                <section>
                  <label className="block">
                    <span className={ui.label}>When is your exam?</span>
                    <select
                      value={examMonth}
                      onChange={(event) => setExamMonth(event.target.value)}
                      className={`${ui.input} cursor-pointer`}
                      data-testid="welcome-exam-month"
                    >
                      {months.map((value) => (
                        <option key={value} value={value}>
                          {monthLabel(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              </>
            ) : null}

            <button
              type="button"
              disabled={!ready}
              onClick={() => setStep(2)}
              className={`${ui.primary} min-h-[52px] w-full text-base disabled:opacity-50`}
              data-testid="welcome-next"
            >
              Make my plan
            </button>
            <p className="text-center text-sm text-muted">
              Want to set chapters, hours and sleep times yourself?{" "}
              <Link href="/roadmap" className="font-medium text-accent underline-offset-4 hover:underline">
                Use the full plan form
              </Link>
            </p>
          </>
        ) : (
          <>
            <header>
              <h1 className="font-display text-3xl text-heading">Add your first book</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Any textbook, guide or notes as a PDF. It stays private to you. Then press and hold any line and tap
                Explain.
              </p>
            </header>

            <button
              type="button"
              onClick={() => finish("/reader?upload=1&tip=explain")}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-4 text-left"
              data-testid="welcome-upload"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-beige-2">
                <FileUp className="h-5 w-5 text-accent" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-heading">Upload a PDF</span>
                <span className="block text-sm text-muted">Your exam plan waits on Today</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => finish("/roadmap")}
              className={`${ui.secondary} min-h-[52px] w-full text-base`}
              data-testid="welcome-later"
            >
              I&apos;ll add a book later. Show my plan
            </button>
            <button type="button" onClick={() => setStep(1)} className={`${ui.ghost} w-full`}>
              Back
            </button>
          </>
        )}
      </main>
    </AppChrome>
  );
}
