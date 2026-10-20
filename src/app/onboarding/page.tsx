"use client";

import React, { useEffect, useMemo, useState } from "react";
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
} from "@/lib/prakriti/onboarding-questions";
import {
  buildInitialCognitiveDnaSummary,
  buildStoredPrakritiPayload,
  LOCAL_PRAKRITI_STORAGE_KEY,
  savePrakritiProfileToDatabase,
} from "@/lib/supabase/profile-sync";
import { createClient } from "@/lib/supabase/client";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";

type OnboardingStep = 1 | 2 | 3 | 4;

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

  const activeTheme = profile.activeConfiguration.theme;

  useEffect(() => {
    const rootDosha = profile.secondaryDosha ?? profile.primaryDosha;
    document.documentElement.setAttribute("data-prakriti-theme", rootDosha);
  }, [profile.primaryDosha, profile.secondaryDosha]);

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

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LOCAL_PRAKRITI_STORAGE_KEY,
          JSON.stringify({
            ...storedPayload,
            fullName: fullName.trim() || null,
            cognitiveDna,
          })
        );
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

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

  return (
    <div
      className="min-h-screen transition-all duration-300 font-sans"
      style={{
        backgroundColor: activeTheme.backgroundHex,
        backgroundImage: activeTheme.canvasGradientCss,
        color: activeTheme.textPrimaryHex,
      }}
    >
      {/* Frosted Glass Tablet-First Header */}
      <header
        className="sticky top-0 z-20 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 py-3.5 shadow-xl shadow-zinc-950/5 md:px-8"
        style={{
          borderColor: activeTheme.borderHex,
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-xl">
                Find your body type
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setInputMode((prev) =>
                  prev === "questions" ? "sliders" : "questions"
                )
              }
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-bold shadow-xs active:scale-95 transition-transform"
              style={{
                backgroundColor: activeTheme.backgroundHex,
                borderColor: activeTheme.borderHex,
              }}
            >
              <Sliders className="h-4 w-4" />
              Mode:{" "}
              {inputMode === "questions"
                ? "Full 45-Question Assessment"
                : "Modular Domain Sliders"}
            </button>

            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 px-5 py-2.5 text-xs font-medium hover:opacity-90 transition-all active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Studio
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        {formNotice && (
          <p role="status" className="text-sm font-medium text-zinc-700">
            {formNotice}
          </p>
        )}

        {/* 4-Step Progress Bar (Touch Targets >= 44x44px) */}
        <nav
          aria-label="Onboarding Steps"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
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
                onClick={() => setStep(item.num)}
                className="flex min-h-[56px] flex-col justify-between rounded-2xl border p-3.5 text-left shadow-sm active:scale-95 transition-transform"
                style={{
                  backgroundColor: active
                    ? activeTheme.accentHex
                    : activeTheme.surfaceHex,
                  color: active ? "#FFFFFF" : activeTheme.textPrimaryHex,
                  borderColor: active
                    ? activeTheme.accentHex
                    : activeTheme.borderHex,
                }}
              >
                <span className="text-xs font-bold">{item.title}</span>
                <span className="text-[11px] opacity-85 line-clamp-1">
                  {item.sub}
                </span>
              </button>
            );
          })}
        </nav>

        {/* STEP 1: Basic Physical Prakriti Assessment (25 Questions / Modular Sliders) */}
        {step === 1 && (
          <section
            className="space-y-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-xl shadow-zinc-950/5 md:p-6"
            style={{
              borderColor: activeTheme.borderHex,
            }}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-4"
              style={{ borderColor: activeTheme.borderHex }}
            >
              <div>
                <h2 className="flex items-center gap-2 font-serif text-lg font-bold">
                  <HeartPulse
                    className="h-5 w-5"
                    style={{ color: activeTheme.accentHex }}
                  />
                  Step 1: {COGNITIVE_METRIC_LABELS.dinacharya.fullLabel} Baseline (25 Questions)
                </h2>
                <p
                  className="text-xs md:text-sm"
                  style={{ color: activeTheme.textSecondaryHex }}
                >
                  Establishes your physical energy rhythm (*Agni*), hydration,
                  and{" "}
                  <strong>
                    {COGNITIVE_METRIC_LABELS.dinacharya.fullLabel}
                  </strong>{" "}
                  break exercises.
                </p>
              </div>
            </div>

            {inputMode === "sliders" ? (
              <div
                className="space-y-4 rounded-2xl border p-4"
                style={{
                  backgroundColor: activeTheme.backgroundHex,
                  borderColor: activeTheme.borderHex,
                }}
              >
                <h3 className="font-serif text-sm font-bold">
                  Modular Physical &amp; Flow Ritual Sliders
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
                      className="h-6 w-full cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {BASIC_PHYSICAL_PRAKRITI_QUESTIONS.map((q) => {
                  const selected = physicalAnswers[q.id];
                  return (
                    <div
                      key={q.id}
                      className="rounded-2xl border p-4 space-y-2.5 shadow-2xs"
                      style={{
                        backgroundColor: activeTheme.backgroundHex,
                        borderColor: activeTheme.borderHex,
                      }}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider opacity-75">
                        <span>
                          Q{q.number}. {q.domainLabel}
                        </span>
                        {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                      </div>
                      <p className="font-serif text-sm font-semibold">
                        {q.prompt}
                      </p>
                      <div className="space-y-2 pt-1">
                        {(["Vata", "Pitta", "Kapha"] as const).map((dosha) => {
                          const isChosen = selected === dosha;
                          return (
                            <button
                              key={`${q.id}-${dosha}`}
                              type="button"
                              onClick={() =>
                                setPhysicalAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: dosha,
                                }))
                              }
                              className="flex min-h-[44px] w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs active:scale-95 transition-transform"
                              style={{
                                backgroundColor: isChosen
                                  ? activeTheme.accentHex
                                  : activeTheme.surfaceHex,
                                color: isChosen
                                  ? "#FFFFFF"
                                  : activeTheme.textPrimaryHex,
                                borderColor: isChosen
                                  ? activeTheme.accentHex
                                  : activeTheme.borderHex,
                              }}
                            >
                              <span>{q.options[dosha]}</span>
                              {isChosen && (
                                <CheckCircle2 className="ml-2 h-4 w-4 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  if (inputMode === "questions" && !physicalComplete) {
                    setFormNotice(
                      "Choose one answer for each constitution question before continuing."
                    );
                    return;
                  }
                  setFormNotice(null);
                  setStep(2);
                }}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
                style={{ backgroundColor: activeTheme.accentHex }}
              >
                Continue to study habits
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: Reading & Cognitive Ability Assessment (20 Questions across 5 Domains) */}
        {step === 2 && (
          <section
            className="space-y-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-xl shadow-zinc-950/5 md:p-6"
            style={{
              borderColor: activeTheme.borderHex,
            }}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-4"
              style={{ borderColor: activeTheme.borderHex }}
            >
              <div>
                <h2 className="flex items-center gap-2 font-serif text-lg font-bold">
                  <Brain
                    className="h-5 w-5"
                    style={{ color: activeTheme.accentHex }}
                  />
                  Step 2: Quick-Take Speed (Dhee), Focus Stamina (Dhriti) &amp; Recall Power (Smriti)
                </h2>
                <p
                  className="text-xs md:text-sm"
                  style={{ color: activeTheme.textSecondaryHex }}
                >
                  Evaluates{" "}
                  <strong>{COGNITIVE_METRIC_LABELS.dhee.fullLabel}</strong>,{" "}
                  <strong>{COGNITIVE_METRIC_LABELS.dhriti.fullLabel}</strong>,{" "}
                  <strong>{COGNITIVE_METRIC_LABELS.smriti.fullLabel}</strong>,
                  Screen Fatigue (*Alochaka Pitta*), and Video Lecture Habits
                  (70% Reader UI &amp; AI Format weight).
                </p>
              </div>
            </div>

            {inputMode === "sliders" ? (
              <div
                className="space-y-4 rounded-2xl border p-4"
                style={{
                  backgroundColor: activeTheme.backgroundHex,
                  borderColor: activeTheme.borderHex,
                }}
              >
                <h3 className="font-serif text-sm font-bold">
                  Modular Cognitive Sliders (Quick-Take Speed, Focus Stamina, Recall Power)
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
                      className="h-6 w-full cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {READING_COGNITIVE_QUESTIONS.map((q) => {
                  const selected = readingAnswers[q.id];
                  return (
                    <div
                      key={q.id}
                      className="rounded-2xl border p-4 space-y-2.5 shadow-2xs"
                      style={{
                        backgroundColor: activeTheme.backgroundHex,
                        borderColor: activeTheme.borderHex,
                      }}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider opacity-75">
                        <span>
                          Q{q.number}. {q.domainLabel}
                        </span>
                        {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                      </div>
                      <p className="font-serif text-sm font-semibold">
                        {q.prompt}
                      </p>
                      <div className="space-y-2 pt-1">
                        {(["Vata", "Pitta", "Kapha"] as const).map((dosha) => {
                          const isChosen = selected === dosha;
                          return (
                            <button
                              key={`${q.id}-${dosha}`}
                              type="button"
                              onClick={() =>
                                setReadingAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: dosha,
                                }))
                              }
                              className="flex min-h-[44px] w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs active:scale-95 transition-transform"
                              style={{
                                backgroundColor: isChosen
                                  ? activeTheme.accentHex
                                  : activeTheme.surfaceHex,
                                color: isChosen
                                  ? "#FFFFFF"
                                  : activeTheme.textPrimaryHex,
                                borderColor: isChosen
                                  ? activeTheme.accentHex
                                  : activeTheme.borderHex,
                              }}
                            >
                              <span>{q.options[dosha]}</span>
                              {isChosen && (
                                <CheckCircle2 className="ml-2 h-4 w-4 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold active:scale-95 transition-transform"
                style={{
                  backgroundColor: activeTheme.backgroundHex,
                  borderColor: activeTheme.borderHex,
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Step 1
              </button>
              <button
                type="button"
                onClick={() => {
                  if (inputMode === "questions" && !readingComplete) {
                    setFormNotice(
                      "Choose one answer for each study-habit question before seeing your result."
                    );
                    return;
                  }
                  setFormNotice(null);
                  setStep(3);
                }}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
                style={{ backgroundColor: activeTheme.accentHex }}
              >
                See my body type
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section
            className="space-y-6 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-xl shadow-zinc-950/5 backdrop-blur-md md:p-8 dark:border-zinc-800/50 dark:bg-zinc-900/80"
            style={{ borderColor: activeTheme.borderHex }}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Your primary body type
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              {profile.displayProfileTitle}
            </h2>
            <p
              className="max-w-xl text-base leading-relaxed"
              style={{ color: activeTheme.textSecondaryHex }}
            >
              {DOSHA_STUDY_PRESETS[profile.primaryDosha].cognitiveSummary}
            </p>
            <p
              className="max-w-xl text-sm leading-relaxed"
              style={{ color: activeTheme.textSecondaryHex }}
            >
              A comfortable reading stretch for you is about{" "}
              {profile.activeConfiguration.pomodoro.studySprintMinutes} minutes,
              followed by a {profile.activeConfiguration.pomodoro.breakMinutes}
              -minute pause.
            </p>

            <div className="max-w-md space-y-2">
              <label
                htmlFor="student-full-name"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Name (optional)
              </label>
              <input
                id="student-full-name"
                type="text"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl border px-4 text-sm font-medium focus:outline-none"
                style={{
                  backgroundColor: activeTheme.backgroundHex,
                  borderColor: activeTheme.borderHex,
                }}
              />
            </div>

            {saveStatus && (
              <div
                role="status"
                className="rounded-2xl border border-emerald-700/30 bg-emerald-50 p-4 text-sm font-medium text-emerald-900"
              >
                {saveStatus}
              </div>
            )}

            {saveError && (
              <div
                role="alert"
                className="rounded-2xl border border-red-700/30 bg-red-50 p-4 text-sm font-medium text-red-900"
              >
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full border px-5 py-3 text-sm font-medium"
                style={{
                  backgroundColor: activeTheme.backgroundHex,
                  borderColor: activeTheme.borderHex,
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAndFinish}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: activeTheme.accentHex }}
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
