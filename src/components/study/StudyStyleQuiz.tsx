"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { activateCompanionStyle } from "@/lib/companion";
import type { Dosha } from "@/lib/prakriti/config";
import { ensureAccountVault, isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
import { patchSprintPrefs } from "@/lib/sprint/persist";
import { writeFocusGuardPrefs } from "@/lib/sprint/guard";
import { createClient } from "@/lib/supabase/client";
import {
  buildStoredPrakritiPayload,
  savePrakritiProfileToDatabase,
  writeLocalPrakritiProfile,
} from "@/lib/supabase/profile-sync";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { readUniversePrefs, UNIVERSE_PRESETS, writeUniversePrefs } from "@/lib/universe";
import {
  BODY_QUESTIONS,
  resultIsRough,
  scoreBody,
  SKIP,
  STUDY_QUESTIONS,
  studySettings,
  STYLE_DISCLAIMER,
  STYLE_NAMES,
  styleFromScores,
  writeStudyProfile,
  type BodyAnswers,
  type StudyAnswers,
  type StudySettings,
  type StyleResult,
} from "@/lib/study/style-quiz";

const TOTAL = BODY_QUESTIONS.length + STUDY_QUESTIONS.length;
const DOSHAS: readonly Dosha[] = ["Vata", "Pitta", "Kapha"];

const EXPLAIN_LABELS: Record<string, string> = {
  story: "Story",
  illustrative: "Illustrate",
  high_yield_revision: "Key points",
  explain: "Explain",
};

const NOTE_LABELS: Record<string, string> = {
  mind_map: "Mind maps",
  revision_table: "Tables and lists",
  memory_aid: "Short memory lines",
  mixed: "A mix",
};

function optionClass(active: boolean): string {
  return `flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-base leading-snug transition-colors ${
    active ? ui.selected : ui.idle
  }`;
}

/** Applies the suggested settings to the sprint timer, focus sound, helper and guard. */
export function applyStudySettings(settings: StudySettings, style: StyleResult, userId: string | null): void {
  const preset = UNIVERSE_PRESETS[style.profileId];
  patchSprintPrefs(
    {
      preferredDuration: settings.sprintMinutes,
      preferredBreakMinutes: settings.breakMinutes,
      dailyTargetMinutes: settings.dailyMinutes,
      rhythm: preset.sprintRhythm,
    },
    userId
  );
  const universe = readUniversePrefs(userId);
  writeUniversePrefs(
    {
      ...universe,
      profileId: style.profileId,
      sessionMinutes: settings.sprintMinutes,
      breakMinutes: settings.breakMinutes,
      dailyGoalMinutes: settings.dailyMinutes,
      focusSound: settings.focusSound,
      soundEnabled: settings.focusSound !== "silence",
    },
    userId
  );
  activateCompanionStyle(settings.helper, userId);
  writeFocusGuardPrefs({ enabled: settings.guardOn });
}

export function StudyStyleQuiz() {
  const [index, setIndex] = useState(0);
  const [bodyAnswers, setBodyAnswers] = useState<BodyAnswers>({});
  const [studyAnswers, setStudyAnswers] = useState<StudyAnswers>({});
  const [done, setDone] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState("");
  const [applied, setApplied] = useState(false);
  const [canKeep, setCanKeep] = useState(true);
  /** Ignores a second tap right after moving on, so a double tap can't answer the next question. */
  const lockedUntil = useRef(0);

  useEffect(() => {
    void fetchSignedInUser()
      .then(async (user) => {
        setUserId(user?.userId ?? null);
        if (user?.userId) await ensureAccountVault().catch(() => false);
      })
      .catch(() => setUserId(null));
  }, []);

  const inBody = index < BODY_QUESTIONS.length;
  const bodyQuestion = inBody ? BODY_QUESTIONS[index] : null;
  const studyQuestion = inBody ? null : STUDY_QUESTIONS[index - BODY_QUESTIONS.length];

  const style = useMemo(() => styleFromScores(scoreBody(bodyAnswers)), [bodyAnswers]);
  const settings = useMemo(() => studySettings(studyAnswers, style), [studyAnswers, style]);

  const next = () => {
    lockedUntil.current = Date.now() + 300;
    if (index + 1 >= TOTAL) {
      setDone(true);
      return;
    }
    setIndex((value) => value + 1);
  };

  // Save once the last answer is in state.
  useEffect(() => {
    if (done) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  async function save() {
    const onDevice = Boolean(userId) && isAccountVaultUnlocked();
    setCanKeep(onDevice);
    const scores = scoreBody(bodyAnswers);
    const result = styleFromScores(scores);
    const finalSettings = studySettings(studyAnswers, result);
    const payload = buildStoredPrakritiPayload(scores, scores);
    writeLocalPrakritiProfile({ ...payload, userId }, userId);
    writeStudyProfile(
      {
        version: 1,
        savedAt: new Date().toISOString(),
        bodyAnswers,
        studyAnswers,
        profileId: result.profileId,
        settings: finalSettings,
      },
      userId
    );
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user?.email) {
        await savePrakritiProfileToDatabase(supabase, {
          userId: data.user.id,
          email: data.user.email,
          basicScores: scores,
          readingScores: scores,
        });
        setSaveNote(
          onDevice
            ? "Saved to your account and this device."
            : "Saved to your account. Open the app again on this device to use these settings."
        );
        return;
      }
      setSaveNote(onDevice ? "Saved on this device." : "Sign in to keep your result and use these settings.");
    } catch {
      setSaveNote(onDevice ? "Saved on this device." : "Sign in to keep your result and use these settings.");
    }
  }

  if (done) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="style-result">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">My study style</p>
          <h1 className="font-display mt-1 text-3xl text-heading" data-testid="style-name">{style.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink">{style.tagline}</p>
        </header>
        {resultIsRough(bodyAnswers) ? (
          <p className={ui.notice} data-testid="style-rough">
            You skipped many questions about yourself, so this result is a rough guide. Take it again when you can,
            perhaps with a parent who knows your habits.
          </p>
        ) : null}

        <section className="space-y-2 rounded-2xl border border-line bg-surface p-4" aria-label="Your mix">
          {DOSHAS.map((dosha) => (
            <div key={dosha}>
              <div className="flex justify-between text-sm">
                <span className="font-medium text-heading">{STYLE_NAMES[dosha]}</span>
                <span className="text-muted">{style.scores[dosha]}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-beige-2" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${style.scores[dosha]}%` }} />
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold text-heading">What helps you</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
              {style.strengths.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold text-heading">Watch out for</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
              {style.watchOuts.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4" data-testid="style-day-plan">
          <h2 className="font-semibold text-heading">Your study day</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink">
            {style.dayPlan.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="style-settings">
          <h2 className="font-semibold text-heading">Your study settings</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-beige-2 p-3"><dt className="text-muted">Sprint</dt><dd className="font-semibold text-heading" data-testid="style-sprint">{settings.sprintMinutes} minutes</dd></div>
            <div className="rounded-xl bg-beige-2 p-3"><dt className="text-muted">Break</dt><dd className="font-semibold text-heading">{settings.breakMinutes} minutes</dd></div>
            <div className="rounded-xl bg-beige-2 p-3"><dt className="text-muted">Daily goal</dt><dd className="font-semibold text-heading">{Math.round(settings.dailyMinutes / 60 * 10) / 10} hours</dd></div>
            <div className="rounded-xl bg-beige-2 p-3"><dt className="text-muted">Try first</dt><dd className="font-semibold text-heading">{EXPLAIN_LABELS[settings.explainFirst] ?? "Explain"}</dd></div>
            <div className="rounded-xl bg-beige-2 p-3"><dt className="text-muted">Notes</dt><dd className="font-semibold text-heading">{NOTE_LABELS[settings.noteStyle] ?? "A mix"}</dd></div>
            <div className="rounded-xl bg-beige-2 p-3"><dt className="text-muted">Focus sound</dt><dd className="font-semibold text-heading">{settings.focusSound === "silence" ? "Silence" : "Soft background"}</dd></div>
          </dl>
          {settings.tips.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink" data-testid="style-tips">
              {settings.tips.map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          ) : null}
          <button
            type="button"
            className={`${ui.primary} min-h-12 w-full`}
            disabled={applied || !canKeep}
            data-testid="style-apply"
            onClick={() => {
              applyStudySettings(settings, style, userId);
              setApplied(true);
            }}
          >
            {applied ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Settings applied
              </>
            ) : (
              "Use these settings"
            )}
          </button>
          {applied ? (
            <p className="text-sm text-success">Your sprint timer, focus sound and Take My Study helper are set. Change any of them in Personalize.</p>
          ) : null}
        </section>

        <p className="text-xs leading-relaxed text-muted" data-testid="style-disclaimer">{STYLE_DISCLAIMER}</p>
        {saveNote ? <p className="text-xs text-muted">{saveNote}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/hub" className={`${ui.secondary} min-h-12`}>Back to Today</Link>
          <button
            type="button"
            className={`${ui.ghost} min-h-12`}
            onClick={() => {
              setDone(false);
              setIndex(0);
              setApplied(false);
              setBodyAnswers({});
              setStudyAnswers({});
              setSaveNote("");
            }}
          >
            Take it again
          </button>
        </div>
      </main>
    );
  }

  const answeredBody = bodyQuestion ? bodyAnswers[bodyQuestion.id] : undefined;
  const answeredStudy = studyQuestion ? studyAnswers[studyQuestion.id] : undefined;
  const percent = Math.round((index / TOTAL) * 100);

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="style-quiz">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-heading">
            {inBody ? "Part 1 of 2 · About you" : "Part 2 of 2 · How you study"}
          </span>
          <span className="text-muted" data-testid="style-progress">
            {index + 1} of {TOTAL}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-beige-2"
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {index === 0 ? (
        <p className={ui.notice}>
          Answer for how you have <strong>usually</strong> been for most of your life, not just this week. There are no
          right or wrong answers, and you can skip any question you're not sure about.
        </p>
      ) : null}
      {index === BODY_QUESTIONS.length ? (
        <p className={ui.notice}>Now a few questions about how you study.</p>
      ) : null}

      <section className={`${ui.cardPad} space-y-4`}>
        <p className={ui.eyebrow}>{bodyQuestion?.topic ?? studyQuestion?.topic}</p>
        <h1 className={`${ui.heading} text-2xl`} data-testid="style-question">
          {bodyQuestion?.prompt ?? studyQuestion?.prompt}
        </h1>
        <div className="space-y-2" role="radiogroup" aria-label={bodyQuestion?.prompt ?? studyQuestion?.prompt}>
          {bodyQuestion
            ? DOSHAS.map((dosha) => (
                <button
                  key={dosha}
                  type="button"
                  role="radio"
                  aria-checked={answeredBody === dosha}
                  className={optionClass(answeredBody === dosha)}
                  onClick={() => {
                    if (Date.now() < lockedUntil.current) return;
                    setBodyAnswers((prev) => ({ ...prev, [bodyQuestion.id]: dosha }));
                    next();
                  }}
                >
                  {bodyQuestion.options[dosha]}
                </button>
              ))
            : studyQuestion?.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={answeredStudy === option.value}
                  className={optionClass(answeredStudy === option.value)}
                  onClick={() => {
                    if (Date.now() < lockedUntil.current) return;
                    setStudyAnswers((prev) => ({ ...prev, [studyQuestion.id]: option.value }));
                    next();
                  }}
                >
                  {option.label}
                </button>
              ))}
        </div>
        <button
          type="button"
          data-testid="style-skip"
          aria-pressed={(answeredBody ?? answeredStudy) === SKIP}
          className={`w-full rounded-2xl border border-dashed px-4 py-3 text-sm ${
            (answeredBody ?? answeredStudy) === SKIP ? "border-beige bg-selected text-heading" : "border-line text-muted hover:bg-beige-2"
          }`}
          onClick={() => {
            if (Date.now() < lockedUntil.current) return;
            if (bodyQuestion) setBodyAnswers((prev) => ({ ...prev, [bodyQuestion.id]: SKIP }));
            if (studyQuestion) setStudyAnswers((prev) => ({ ...prev, [studyQuestion.id]: SKIP }));
            next();
          }}
        >
          I&apos;m not sure, skip this question
        </button>
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className={ui.ghost}
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          data-testid="style-back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        <Link href="/hub" className="text-sm text-muted underline-offset-4 hover:underline">
          Finish later
        </Link>
      </div>
      <p className="text-xs leading-relaxed text-muted">{STYLE_DISCLAIMER}</p>
    </main>
  );
}
