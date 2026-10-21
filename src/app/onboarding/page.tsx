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
  COGNITIVE_METRIC_LABELS,
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
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";

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
    <article className="rounded-3xl border border-amber-500/30 bg-black p-5 shadow-xl shadow-black/30">
      <p className="text-xs font-medium uppercase tracking-widest text-amber-200">
        Question {question.number} · {question.domainLabel}
      </p>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">
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
              className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-relaxed transition-colors ${
                chosen
                  ? "border-amber-200/40 bg-amber-950/50 font-medium text-amber-50"
                  : "border-amber-500/30 bg-zinc-950 text-amber-100 hover:border-amber-200/40"
              }`}
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
        setSaveStatus("Your body type is saved. Opening your studio...");
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
          setSaveStatus("Your body type is saved. Opening your studio...");
        } else {
          setSaveStatus("Saved on this device. Opening your studio...");
        }
      }

      setTimeout(() => {
        router.push("/hub");
      }, 600);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to save Body Type Profile.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const goToStep = (next: OnboardingStep) => {
    if (next === 2 && inputMode === "questions" && !physicalComplete) {
      setFormNotice("Answer each constitution question before opening study habits.");
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
    <div className="min-h-screen bg-zinc-950 font-sans text-amber-100">
      <header className="sticky top-0 z-20 border-b border-amber-500/30 bg-black/90 px-4 py-3.5 backdrop-blur-md md:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
            <h1 className="text-lg font-semibold tracking-tight text-white md:text-xl">
              Discover Your Cognitive Prakriti
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setInputMode((prev) =>
                  prev === "questions" ? "sliders" : "questions"
                )
              }
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-amber-500/30 px-3.5 py-2 text-xs font-medium text-amber-100"
            >
              <Sliders className="h-4 w-4 text-amber-200" />
              {inputMode === "questions" ? "Questions" : "Sliders"}
            </button>

            <Link
              href="/body-type"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-amber-500/30 px-4 text-xs font-medium text-amber-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        {formNotice && (
          <p role="status" className="text-sm font-medium text-amber-100">
            {formNotice}
          </p>
        )}

        <nav aria-label="Onboarding Steps" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              num: 1 as OnboardingStep,
              title: "Constitution",
              sub: "How your energy shows up",
            },
            {
              num: 2 as OnboardingStep,
              title: "Study habits",
              sub: "How you read and recall",
            },
            {
              num: 3 as OnboardingStep,
              title: "Your result",
              sub: "Primary body type",
            },
          ].map((item) => {
            const active = step === item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => goToStep(item.num)}
                className={`flex min-h-[56px] flex-col justify-center rounded-2xl border px-4 py-3 text-left ${
                  active
                    ? "border-amber-200/40 bg-amber-950/50 text-amber-50"
                    : "border-amber-500/30 bg-zinc-950 text-amber-200"
                }`}
              >
                <span className="text-sm font-semibold">{item.title}</span>
                <span className={`text-xs ${active ? "text-amber-200" : "text-amber-100"}`}>
                  {item.sub}
                </span>
              </button>
            );
          })}
        </nav>

        {/* STEP 1: Basic Physical Prakriti Assessment (25 Questions / Modular Sliders) */}
        {step === 1 && (
          <section className="space-y-5 rounded-3xl border border-amber-500/30 bg-zinc-950 p-5 shadow-xl shadow-black/30 md:p-6">
            <div className="border-b border-amber-500/30 pb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <HeartPulse className="h-5 w-5 text-amber-200" />
                Constitution
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-amber-100">
                These questions look at energy, appetite, and how you recover.{" "}
                {COGNITIVE_METRIC_LABELS.dinacharya.fullLabel} shapes the pauses between study blocks.
              </p>
            </div>

            {inputMode === "sliders" ? (
              <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-black p-4">
                <h3 className="text-sm font-semibold text-white">
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
                      className="h-6 w-full cursor-pointer accent-amber-200"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                key={`physical-${physicalPage}`}
                className="space-y-4 [animation:oryzen-rise_180ms_ease]"
              >
                <p className="text-sm text-amber-100">
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
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-amber-500/30 px-5 text-sm font-medium text-amber-100 disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={advancePhysical}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/50 px-6 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
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
          <section className="space-y-5 rounded-3xl border border-amber-500/30 bg-zinc-950 p-5 shadow-xl shadow-black/30 md:p-6">
            <div className="border-b border-amber-500/30 pb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Brain className="h-5 w-5 text-amber-200" />
                Study habits
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-amber-100">
                {COGNITIVE_METRIC_LABELS.dhee.fullLabel},{" "}
                {COGNITIVE_METRIC_LABELS.dhriti.fullLabel}, and{" "}
                {COGNITIVE_METRIC_LABELS.smriti.fullLabel} decide how the reader paces you.
              </p>
            </div>

            {inputMode === "sliders" ? (
              <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-black p-4">
                <h3 className="text-sm font-semibold text-white">
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
                      className="h-6 w-full cursor-pointer accent-amber-200"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                key={`reading-${readingPage}`}
                className="space-y-4 [animation:oryzen-rise_180ms_ease]"
              >
                <p className="text-sm text-amber-100">
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
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-amber-500/30 px-5 text-sm font-medium text-amber-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={advanceReading}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/50 px-6 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
              >
                {inputMode === "questions" && readingPage < readingPageCount - 1
                  ? "Next"
                  : "See my cognitive prakriti"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-6 rounded-3xl border border-amber-500/30 bg-zinc-950 p-5 shadow-xl shadow-black/30 md:p-8">
            <p className="text-xs font-medium uppercase tracking-widest text-amber-200">
              Your cognitive prakriti
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              {profile.displayProfileTitle}
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-amber-100">
              {DOSHA_STUDY_PRESETS[profile.primaryDosha].cognitiveSummary}
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-amber-100">
              A comfortable reading stretch for you is about{" "}
              {profile.activeConfiguration.pomodoro.studySprintMinutes} minutes,
              followed by a {profile.activeConfiguration.pomodoro.breakMinutes}
              -minute pause.
            </p>

            <div className="max-w-md space-y-2">
              <label
                htmlFor="student-full-name"
                className="block text-xs font-medium uppercase tracking-wider text-amber-200"
              >
                Name (optional)
              </label>
              <input
                id="student-full-name"
                type="text"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl border border-amber-500/30 bg-black px-4 text-sm text-amber-100 placeholder:text-amber-100/50 focus:outline-none"
              />
            </div>

            {saveStatus && (
              <div
                role="status"
                className="rounded-2xl border border-amber-500/30 bg-black p-4 text-sm font-medium text-amber-100"
              >
                {saveStatus}
              </div>
            )}

            {saveError && (
              <div
                role="alert"
                className="rounded-2xl border border-red-400/40 bg-black p-4 text-sm font-medium text-red-200"
              >
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-amber-500/30 px-5 text-sm font-medium text-amber-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAndFinish}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/50 px-6 text-sm font-medium text-amber-100 hover:bg-amber-950/70 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
