"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  HeartPulse,
  Sliders,
} from "lucide-react";
import {
  calculatePrakritiProfile,
  DOSHA_STUDY_PRESETS,
  PRAKRITI_PROFILE_LABELS,
  type Dosha,
  type DoshaScores,
} from "@/lib/prakriti/config";
import {
  BASIC_PHYSICAL_PRAKRITI_QUESTIONS,
  computeScoresFromResponses,
  READING_COGNITIVE_QUESTIONS,
  type AssessmentQuestion,
} from "@/lib/prakriti/onboarding-questions";
import {
  buildInitialCognitiveDnaSummary,
  buildStoredPrakritiPayload,
  LOCAL_PRAKRITI_STORAGE_KEY,
  savePrakritiProfileToDatabase,
} from "@/lib/supabase/profile-sync";
import { createClient } from "@/lib/supabase/client";
import { modernProfileHeadline } from "@/lib/study/body-type";
import AppChrome from "@/components/layout/AppChrome";
import { choiceClass, ui } from "@/components/ui/classes";

type OnboardingStep = 1 | 2 | 3;

const QUESTIONS_PER_PAGE = 2;

function pageCount(total: number): number {
  return Math.ceil(total / QUESTIONS_PER_PAGE);
}

function pageSlice(questions: readonly AssessmentQuestion[], page: number): AssessmentQuestion[] {
  const start = page * QUESTIONS_PER_PAGE;
  return questions.slice(start, start + QUESTIONS_PER_PAGE);
}

function questionRangeLabel(questions: readonly AssessmentQuestion[], total: number): string {
  const first = questions[0]?.number;
  const last = questions[questions.length - 1]?.number;
  if (!first || !last) return "";
  const span = first === last ? `Question ${first}` : `Questions ${first}–${last}`;
  return `${span} of ${total}`;
}

function QuestionCard({
  question,
  selected,
  onSelect,
}: {
  question: AssessmentQuestion;
  selected: Dosha | undefined;
  onSelect: (dosha: Dosha) => void;
}) {
  return (
    <article className={ui.cardPad}>
      <p className={ui.eyebrow}>
        Question {question.number} · {question.domainLabel}
      </p>
      <h3 className={`${ui.heading} mt-3 text-xl`}>
        {question.prompt}
      </h3>
      <div className="mt-5 space-y-3">
        {(["Vata", "Pitta", "Kapha"] as const).map((dosha) => {
          const chosen = selected === dosha;
          return (
            <button
              key={`${question.id}-${dosha}`}
              type="button"
              onClick={() => onSelect(dosha)}
              className={choiceClass(chosen)}
            >
              <span>{question.options[dosha]}</span>
              {chosen ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </article>
  );
}

export default function PrakritiOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [inputMode, setInputMode] = useState<"questions" | "sliders">(
    "questions"
  );

  // Step 1: 25 Basic Physical Prakriti answers
  const [physicalAnswers, setPhysicalAnswers] = useState<Record<string, Dosha>>(
    {}
  );
  const [physicalSliders, setPhysicalSliders] = useState<DoshaScores>({
    Vata: 55,
    Pitta: 30,
    Kapha: 15,
  });

  // Step 2: 20 Reading & Cognitive answers across Quick-Take Speed (Dhee), Focus Stamina (Dhriti), Recall Power (Smriti)
  const [readingAnswers, setReadingAnswers] = useState<Record<string, Dosha>>(
    {}
  );
  const [readingSliders, setReadingSliders] = useState<DoshaScores>({
    Vata: 60,
    Pitta: 25,
    Kapha: 15,
  });

  // Step 4: Persistence state
  const [fullName, setFullName] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [physicalPage, setPhysicalPage] = useState(0);
  const [readingPage, setReadingPage] = useState(0);

  const basicScores = useMemo(
    () =>
      computeScoresFromResponses(
        BASIC_PHYSICAL_PRAKRITI_QUESTIONS,
        physicalAnswers,
        inputMode === "sliders" ? physicalSliders : null
      ),
    [physicalAnswers, physicalSliders, inputMode]
  );

  const readingScores = useMemo(
    () =>
      computeScoresFromResponses(
        READING_COGNITIVE_QUESTIONS,
        readingAnswers,
        inputMode === "sliders" ? readingSliders : null
      ),
    [readingAnswers, readingSliders, inputMode]
  );

  const profile = useMemo(
    () => calculatePrakritiProfile(basicScores, readingScores),
    [basicScores, readingScores]
  );

  const physicalPageCount = pageCount(BASIC_PHYSICAL_PRAKRITI_QUESTIONS.length);
  const readingPageCount = pageCount(READING_COGNITIVE_QUESTIONS.length);
  const visiblePhysical = pageSlice(BASIC_PHYSICAL_PRAKRITI_QUESTIONS, physicalPage);
  const visibleReading = pageSlice(READING_COGNITIVE_QUESTIONS, readingPage);

  const physicalComplete = BASIC_PHYSICAL_PRAKRITI_QUESTIONS.every(
    (question) => physicalAnswers[question.id]
  );
  const readingComplete = READING_COGNITIVE_QUESTIONS.every(
    (question) => readingAnswers[question.id]
  );

  const handleSaveAndFinish = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveStatus(null);

    try {
      const storedPayload = buildStoredPrakritiPayload(
        basicScores,
        readingScores
      );
      const cognitiveDna = buildInitialCognitiveDnaSummary(
        storedPayload.calculated
      );

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LOCAL_PRAKRITI_STORAGE_KEY,
          JSON.stringify({
            ...storedPayload,
            userId: user?.id ?? null,
            fullName: fullName.trim() || null,
            cognitiveDna,
          })
        );
      }

      if (user && user.email) {
        await savePrakritiProfileToDatabase(supabase, {
          userId: user.id,
          email: user.email,
          fullName: fullName.trim() || null,
          basicScores,
          readingScores,
        });
        setSaveStatus("Your learning profile is saved. Opening your learning space...");
      } else {
        const apiRes = await fetch("/api/profile/prakriti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            basicScores,
            readingScores,
            fullName: fullName.trim() || null,
          }),
        });

        if (apiRes.ok) {
          setSaveStatus("Your learning profile is saved. Opening your learning space...");
        } else {
          setSaveStatus("Saved on this device. Opening your learning space...");
        }
      }

      setTimeout(() => {
        router.push("/companion?from=onboarding");
      }, 600);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "We couldn't save your learning profile. Please try again.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const goToStep = (next: OnboardingStep) => {
    if (next === 2 && inputMode === "questions" && !physicalComplete) {
      setFormNotice("Answer each question about your energy and pace before continuing.");
      return;
    }
    if (next === 3 && inputMode === "questions" && (!physicalComplete || !readingComplete)) {
      setFormNotice("Answer each question before seeing your result.");
      return;
    }
    setFormNotice(null);
    setStep(next);
  };

  const advancePhysical = () => {
    if (inputMode === "sliders") {
      setFormNotice(null);
      setStep(2);
      return;
    }
    const unanswered = visiblePhysical.some((question) => !physicalAnswers[question.id]);
    if (unanswered) {
      setFormNotice("Choose an answer for each question on this page.");
      return;
    }
    setFormNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (physicalPage < physicalPageCount - 1) {
      setPhysicalPage((page) => page + 1);
      return;
    }
    setReadingPage(0);
    setStep(2);
  };

  const advanceReading = () => {
    if (inputMode === "sliders") {
      setFormNotice(null);
      setStep(3);
      return;
    }
    const unanswered = visibleReading.some((question) => !readingAnswers[question.id]);
    if (unanswered) {
      setFormNotice("Choose an answer for each question on this page.");
      return;
    }
    setFormNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (readingPage < readingPageCount - 1) {
      setReadingPage((page) => page + 1);
      return;
    }
    setStep(3);
  };

  return (
    <AppChrome
      nav="marketing"
      subtitle="Your Learning Rhythm"
      maxWidthClass="max-w-3xl"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setInputMode((prev) =>
                prev === "questions" ? "sliders" : "questions"
              )
            }
            className={ui.secondary}
          >
            <Sliders className="h-4 w-4" />
            {inputMode === "questions" ? "Questions" : "Sliders"}
          </button>
          <Link href="/body-type" className={ui.ghost}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
      }
    >
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        <div>
          <p className={ui.eyebrow}>Your Learning Rhythm</p>
          <h1 className={`${ui.heading} mt-2 text-3xl`}>Discover Your Learning Rhythm</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            This explores your preferences, routines, and focus habits, with an
            Ayurveda-inspired perspective. It is a starting point for how you
            study, not a scientific claim about intelligence, memory, or academic
            performance.
          </p>
        </div>
        {formNotice && (
          <p role="status" className="text-sm font-medium text-heading">
            {formNotice}
          </p>
        )}

        <nav aria-label="Onboarding Steps" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              num: 1 as OnboardingStep,
              title: "Your energy",
              sub: "How your pace shows up",
            },
            {
              num: 2 as OnboardingStep,
              title: "Study habits",
              sub: "How you read and recall",
            },
            {
              num: 3 as OnboardingStep,
              title: "Your result",
              sub: "Your study preferences",
            },
          ].map((item) => {
            const active = step === item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => goToStep(item.num)}
                className={`flex min-h-[56px] flex-col justify-center rounded-2xl border px-4 py-3 text-left ${
                  active ? ui.selected : ui.idle
                }`}
              >
                <span className="text-sm font-semibold">{item.title}</span>
                <span className={`text-xs ${active ? "text-accent" : "text-muted"}`}>
                  {item.sub}
                </span>
              </button>
            );
          })}
        </nav>

        {/* STEP 1: Basic Physical Prakriti Assessment (25 Questions / Modular Sliders) */}
        {step === 1 && (
          <section className="surface-card space-y-5 p-5 md:p-6">
            <div className="border-b border-line pb-4">
              <h2 className="flex items-center gap-2 font-display text-lg text-heading">
                <HeartPulse className="h-5 w-5 text-accent" />
                Your energy
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                These questions look at energy, appetite, and how you recover.
                They help suggest pauses between study blocks—not a measure of ability.
              </p>
            </div>

            {inputMode === "sliders" ? (
              <div className="space-y-4 rounded-2xl border border-line bg-beige-2 p-4">
                <h3 className="text-sm font-semibold text-heading">
                  Physical balance
                </h3>
                {(["Vata", "Pitta", "Kapha"] as const).map((dosha) => (
                  <div key={`phys-slider-${dosha}`} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{PRAKRITI_PROFILE_LABELS[dosha]}</span>
                      <span className="font-mono">{basicScores[dosha]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      aria-label={`Physical ${dosha} Slider`}
                      value={physicalSliders[dosha]}
                      onChange={(e) =>
                        setPhysicalSliders((prev) => ({
                          ...prev,
                          [dosha]: Number(e.target.value),
                        }))
                      }
                      className="h-6 w-full cursor-pointer accent-accent"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                key={`physical-${physicalPage}`}
                className="space-y-4 [animation:oryzen-rise_180ms_ease]"
              >
                <p className="text-sm text-muted">
                  {questionRangeLabel(
                    visiblePhysical,
                    BASIC_PHYSICAL_PRAKRITI_QUESTIONS.length
                  )}
                </p>
                {visiblePhysical.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selected={physicalAnswers[question.id]}
                    onSelect={(dosha) =>
                      setPhysicalAnswers((prev) => ({
                        ...prev,
                        [question.id]: dosha,
                      }))
                    }
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setFormNotice(null);
                  if (physicalPage > 0) setPhysicalPage((page) => page - 1);
                }}
                disabled={inputMode === "questions" && physicalPage === 0}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={advancePhysical}
                className="btn-primary text-sm"
              >
                {inputMode === "questions" && physicalPage < physicalPageCount - 1
                  ? "Next"
                  : "Continue to study habits"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: Reading & Cognitive Ability Assessment (20 Questions across 5 Domains) */}
        {step === 2 && (
          <section className="surface-card space-y-5 p-5 md:p-6">
            <div className="border-b border-line pb-4">
              <h2 className="flex items-center gap-2 font-display text-lg text-heading">
                <Brain className="h-5 w-5 text-accent" />
                Study habits
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                These questions look at how quickly you grasp ideas, how long you
                stay focused, and how you recall them. They help suggest a reading
                pace you can try.
              </p>
            </div>

            {inputMode === "sliders" ? (
              <div className="space-y-4 rounded-2xl border border-line bg-beige-2 p-4">
                <h3 className="text-sm font-semibold text-heading">
                  Study-habit balance
                </h3>
                {(["Vata", "Pitta", "Kapha"] as const).map((dosha) => (
                  <div key={`read-slider-${dosha}`} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{PRAKRITI_PROFILE_LABELS[dosha]}</span>
                      <span className="font-mono">{readingScores[dosha]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      aria-label={`Reading ${dosha} Slider`}
                      value={readingSliders[dosha]}
                      onChange={(e) =>
                        setReadingSliders((prev) => ({
                          ...prev,
                          [dosha]: Number(e.target.value),
                        }))
                      }
                      className="h-6 w-full cursor-pointer accent-accent"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                key={`reading-${readingPage}`}
                className="space-y-4 [animation:oryzen-rise_180ms_ease]"
              >
                <p className="text-sm text-muted">
                  {questionRangeLabel(
                    visibleReading,
                    READING_COGNITIVE_QUESTIONS.length
                  )}
                </p>
                {visibleReading.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selected={readingAnswers[question.id]}
                    onSelect={(dosha) =>
                      setReadingAnswers((prev) => ({
                        ...prev,
                        [question.id]: dosha,
                      }))
                    }
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setFormNotice(null);
                  if (inputMode === "sliders" || readingPage === 0) {
                    setStep(1);
                    return;
                  }
                  setReadingPage((page) => page - 1);
                }}
                className="btn-secondary text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={advanceReading}
                className="btn-primary text-sm"
              >
                {inputMode === "questions" && readingPage < readingPageCount - 1
                  ? "Next"
                  : "See my learning rhythm"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="surface-card space-y-6 p-5 md:p-8">
            <p className={ui.eyebrow}>
              Your learning profile
            </p>
            <h2 className={`${ui.heading} text-3xl`}>
              {modernProfileHeadline(profile.displayProfileTitle)}
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-ink">
              {DOSHA_STUDY_PRESETS[profile.primaryDosha].cognitiveSummary}
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted">
              A comfortable reading stretch for you is about{" "}
              {profile.activeConfiguration.pomodoro.studySprintMinutes} minutes,
              followed by a {profile.activeConfiguration.pomodoro.breakMinutes}
              -minute pause. These are optional strategies to try—not a measure of
              ability.
            </p>
            <details className="max-w-xl rounded-2xl border border-line bg-beige-2 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-heading">
                About This Approach
              </summary>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <p>
                  This reading is inspired by Ayurveda as a way to talk about
                  energy, pace, and study habits. In that language, this pattern
                  is called {profile.classification}.
                </p>
                <p>
                  It does not scientifically determine intelligence, memory, or
                  academic performance.
                </p>
              </div>
            </details>

            <div className="max-w-md space-y-2">
              <label
                htmlFor="student-full-name"
                className={ui.label}
              >
                Name (optional)
              </label>
              <input
                id="student-full-name"
                type="text"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={ui.input}
              />
            </div>

            {saveStatus && (
              <div
                role="status"
                className={ui.notice}
              >
                {saveStatus}
              </div>
            )}

            {saveError && (
              <div
                role="alert"
                className={ui.alert}
              >
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-secondary text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAndFinish}
                className="btn-primary text-sm disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </section>
        )}

      </main>
    </AppChrome>
  );
}
