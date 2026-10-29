"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CompanionFigure } from "@/components/companion/CompanionFigure";
import { READINESS_FEELINGS, READINESS_NOTE, readinessSuggestion, type ReadinessFeeling } from "@/lib/experience/check-in";
import {
  experienceVisibleTo,
  readExperienceRecord,
} from "@/lib/experience/persist";
import { EMPTY_LEARNING_RECORD, readLearningRecord, type LearningRecord } from "@/lib/experience/record";
import { evaluateLearning, type LearningEvaluation } from "@/lib/experience/rewards";
import type { ExperienceId } from "@/lib/experience/types";
import { readLearningWorld, writeLearningWorld, type LearningWorld } from "@/lib/experience/world";
import { readCompanionStore, STARTER_COMPANIONS, STYLE_COPY, type CompanionStyle } from "@/lib/companion";
import { ensureAccountVault, isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { daysBetween, localIsoDate } from "@/lib/roadmap/time";

export interface StudioSnapshot {
  userId: string | null;
  locked: boolean;
  record: LearningRecord;
  evaluation: LearningEvaluation;
  world: LearningWorld;
  experience: ExperienceId | "preserve" | null;
  rewards: boolean;
  companionStyle: CompanionStyle;
  examDaysLeft: number | null;
}

function snapshotFromStorage(): StudioSnapshot {
  const prefs = readExperienceRecord();
  const today = localIsoDate();
  const evaluation = evaluateLearning(EMPTY_LEARNING_RECORD, today);
  return {
    userId: prefs?.ownerId ?? null,
    locked: true,
    record: EMPTY_LEARNING_RECORD,
    evaluation,
    world: readLearningWorld(null, evaluation),
    experience: prefs?.experience ?? "preserve",
    rewards: prefs?.rewards !== false,
    companionStyle: "teacher",
    examDaysLeft: null,
  };
}

export function useStudioSnapshot(): {
  snapshot: StudioSnapshot | null;
  save: (next: LearningWorld) => void;
} {
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const giveUp = window.setTimeout(() => {
      if (!cancelled) setSnapshot((current) => current ?? snapshotFromStorage());
    }, 1200);
    void (async () => {
      const user = await fetchSignedInUser().catch(() => null);
      const userId = user?.userId ?? null;
      if (userId) {
        await Promise.race([
          ensureAccountVault().catch(() => undefined),
          new Promise((resolve) => window.setTimeout(resolve, 2000)),
        ]);
      }
      if (cancelled) return;
      const locked = Boolean(userId) && !isAccountVaultUnlocked();
      let recordTimedOut = false;
      const record = locked
        ? EMPTY_LEARNING_RECORD
        : await Promise.race([
            readLearningRecord(userId).catch(() => EMPTY_LEARNING_RECORD),
            new Promise<LearningRecord>((resolve) => {
              window.setTimeout(() => {
                recordTimedOut = true;
                resolve(EMPTY_LEARNING_RECORD);
              }, 2000);
            }),
          ]);
      if (cancelled) return;
      const today = localIsoDate();
      const evaluation = evaluateLearning(record, today);
      const world = locked ? readLearningWorld(null, evaluation) : readLearningWorld(userId, evaluation);
      const prefs = experienceVisibleTo(userId);
      const companion = readCompanionStore(userId);
      setSnapshot({
        userId,
        locked: locked || recordTimedOut,
        record,
        evaluation,
        world: { ...world, ownerId: userId },
        experience: prefs?.experience ?? (prefs ? null : "preserve"),
        rewards: prefs?.rewards !== false,
        companionStyle: companion.prefs.style,
        examDaysLeft: record.roadmap ? daysBetween(today, record.roadmap.examDate) : null,
      });
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
    };
  }, []);

  const save = (next: LearningWorld) => {
    setSnapshot((current) => {
      if (!current?.userId || current.locked) return current;
      const saved = writeLearningWorld(next, current.userId, current.evaluation);
      return { ...current, world: saved };
    });
  };

  return { snapshot, save };
}

function formatWhen(value: string | null, earned: boolean): string {
  if (!earned) return "Not earned yet";
  if (!value) return "Recorded on this account";
  const day = value.slice(0, 10);
  return Number.isNaN(Date.parse(value)) && !/^\d{4}-\d{2}-\d{2}$/.test(day) ? "Recorded on this account" : `Recorded ${day}`;
}

export function StudioNav() {
  const links = [
    ["/studio", "Sticker Studio"],
    ["/studio/badges", "Badges"],
    ["/studio/room", "Study Room"],
    ["/studio/garden", "Knowledge Garden"],
    ["/studio/passport", "Passport"],
    ["/studio/museum", "Memory Museum"],
  ] as const;
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Studio">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="btn-secondary min-h-11 px-3 text-xs">
          {label}
        </Link>
      ))}
    </nav>
  );
}

function LockedNote({ locked }: { locked: boolean }) {
  if (!locked) return null;
  return (
    <p className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-ink" role="status">
      This account&apos;s study record is locked on this device. Sign in again before stickers or the study room can be saved.
    </p>
  );
}

export function StickerStudio() {
  const { snapshot, save } = useStudioSnapshot();
  const [category, setCategory] = useState("all");
  if (!snapshot) return <p className="text-sm text-muted">Reading this account&apos;s study record...</p>;
  const categories = ["all", ...new Set(snapshot.evaluation.stickers.map((item) => item.category))];
  const visible = snapshot.evaluation.stickers.filter((item) => category === "all" || item.category === category);
  return (
    <div data-testid="sticker-studio" className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-reading text-3xl text-heading">Sticker Studio</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink">
          Stickers come from books, notes, quizzes, and plan blocks already saved on this account. Locked stickers stay visible so you can see the condition. Nothing here is a streak or a purchase.
        </p>
      </header>
      <StudioNav />
      <LockedNote locked={snapshot.locked} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sticker collections">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-11 rounded-full border px-3 text-xs ${category === item ? "border-accent bg-selected text-heading" : "border-line text-ink"}`}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((sticker) => {
          const favorite = snapshot.world.favoriteStickerId === sticker.id;
          return (
            <li key={sticker.id} data-testid={`sticker-${sticker.id}`} className="rounded-3xl border border-line bg-surface p-3">
              <StickerMark earned={sticker.earned} category={sticker.category} />
              <h2 className="mt-2 font-ui text-lg text-heading">{sticker.title}</h2>
              <p className="text-sm text-ink">{sticker.detail}</p>
              <p className="mt-1 text-xs text-muted">{formatWhen(sticker.earnedAt, sticker.earned)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={!sticker.earned || snapshot.locked || !snapshot.userId}
                  onClick={() => save({ ...snapshot.world, favoriteStickerId: favorite ? null : sticker.id })}
                >
                  {favorite ? "Favorite on your profile" : "Use as profile sticker"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BadgeGallery() {
  const { snapshot } = useStudioSnapshot();
  if (!snapshot) return <p className="text-sm text-muted">Reading this account&apos;s study record...</p>;
  return (
    <div data-testid="badge-gallery" className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-reading text-3xl text-heading">Achievement badges</h1>
        <p className="max-w-2xl text-sm text-ink">Each badge uses a saved note, chapter, quiz, or plan block. A locked badge is not a missed streak.</p>
      </header>
      <StudioNav />
      <LockedNote locked={snapshot.locked} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {snapshot.evaluation.badges.map((badge) => (
          <li key={badge.id} data-testid={`badge-${badge.id}`} className={`rounded-3xl border p-3 ${badge.earned ? "border-accent bg-selected" : "border-line bg-surface"}`}>
            <BadgeMark earned={badge.earned} />
            <h2 className="mt-2 font-ui text-lg text-heading">{badge.title}</h2>
            <p className="text-sm text-ink">{badge.detail}</p>
            <p className="mt-1 text-xs text-muted">{badge.earned ? "Unlocked" : "Locked"} · {formatWhen(badge.earnedAt, badge.earned)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StudyRoom() {
  const { snapshot, save } = useStudioSnapshot();
  if (!snapshot) return <p className="text-sm text-muted">Reading this account&apos;s study record...</p>;
  const starter = STARTER_COMPANIONS.find((member) => member.style === snapshot.companionStyle) ?? STARTER_COMPANIONS[0];
  const earnedStickers = snapshot.evaluation.stickers.filter((item) => item.earned);
  const earnedBadges = snapshot.evaluation.badges.filter((item) => item.earned);
  const titles = snapshot.evaluation.titles.filter((item) => item.earned);
  const canSave = Boolean(snapshot.userId) && !snapshot.locked;
  const update = (patch: Partial<LearningWorld>) => save({ ...snapshot.world, ...patch });
  return (
    <div data-testid="study-room" className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-reading text-3xl text-heading">My Study Room</h1>
        <p className="max-w-2xl text-sm text-ink">
          The paper room is available before any reward. Extra desks, walls, and accessories unlock from saved learning. The study pet is not a person and does not speak.
        </p>
      </header>
      <StudioNav />
      <LockedNote locked={snapshot.locked} />
      <RoomScene world={snapshot.world} companionStyle={snapshot.companionStyle} stickers={earnedStickers.filter((item) => snapshot.world.placedStickerIds.includes(item.id)).map((item) => item.title)} />
      <div className="grid gap-3 lg:grid-cols-2">
        <fieldset className="space-y-2 rounded-3xl border border-line bg-surface p-3">
          <legend className="font-ui text-lg text-heading">Room</legend>
          <ChoiceRow label="Background" options={snapshot.evaluation.backgrounds} value={snapshot.world.background} disabled={!canSave} onChange={(background) => update({ background: background as LearningWorld["background"] })} />
          <ChoiceRow label="Desk" options={snapshot.evaluation.desks} value={snapshot.world.desk} disabled={!canSave} onChange={(desk) => update({ desk: desk as LearningWorld["desk"] })} />
          <ChoiceRow label="Wall" options={snapshot.evaluation.walls} value={snapshot.world.wall} disabled={!canSave} onChange={(wall) => update({ wall: wall as LearningWorld["wall"] })} />
        </fieldset>
        <fieldset className="space-y-2 rounded-3xl border border-line bg-surface p-3">
          <legend className="font-ui text-lg text-heading">Companion and pet</legend>
          <div className="flex items-center gap-3">
            <CompanionFigure character={starter?.character ?? "leaf"} still className="h-16 w-16" />
            <p className="text-sm text-ink">{starter?.name} · {STYLE_COPY[snapshot.companionStyle].label}. Change this in Take My Study.</p>
          </div>
          <ChoiceRow label="Companion accessory" options={snapshot.evaluation.companionAccessories} value={snapshot.world.companionAccessory} disabled={!canSave} onChange={(companionAccessory) => update({ companionAccessory: companionAccessory as LearningWorld["companionAccessory"] })} />
          <label className="block text-sm text-ink" htmlFor="pet-name">
            Study pet name
            <input id="pet-name" data-testid="pet-name" value={snapshot.world.petName} maxLength={24} disabled={!canSave} onChange={(event) => update({ petName: event.target.value })} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" placeholder="Optional name" />
          </label>
          <ChoiceRow label="Pet accessory" options={snapshot.evaluation.petAccessories} value={snapshot.world.petAccessory} disabled={!canSave} onChange={(petAccessory) => update({ petAccessory: petAccessory as LearningWorld["petAccessory"] })} />
          <label className="block text-sm text-ink">
            Title
            <select className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" value={snapshot.world.selectedTitleId ?? ""} disabled={!canSave} onChange={(event) => update({ selectedTitleId: event.target.value || null })}>
              <option value="">No title</option>
              {titles.map((title) => <option key={title.id} value={title.id}>{title.title}</option>)}
            </select>
          </label>
        </fieldset>
      </div>
      <section className="space-y-2">
        <h2 className="font-ui text-lg text-heading">Stickers in this room</h2>
        {earnedStickers.length === 0 ? <p className="text-sm text-muted">Earned stickers can be placed here. None are earned yet.</p> : null}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {earnedStickers.map((sticker) => {
            const placed = snapshot.world.placedStickerIds.includes(sticker.id);
            return (
              <li key={sticker.id}>
                <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={placed}
                    disabled={!canSave}
                    onChange={() => {
                      const placedStickerIds = placed
                        ? snapshot.world.placedStickerIds.filter((id) => id !== sticker.id)
                        : [...snapshot.world.placedStickerIds, sticker.id];
                      update({ placedStickerIds });
                    }}
                  />
                  {sticker.title}
                </label>
              </li>
            );
          })}
        </ul>
        <h2 className="font-ui text-lg text-heading">Badges on the wall</h2>
        {earnedBadges.length === 0 ? <p className="text-sm text-muted">Earned badges can be shown on the wall.</p> : null}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {earnedBadges.map((badge) => {
            const shown = snapshot.world.shownBadgeIds.includes(badge.id);
            return (
              <li key={badge.id}>
                <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-sm text-ink">
                  <input type="checkbox" checked={shown} disabled={!canSave} onChange={() => update({ shownBadgeIds: shown ? snapshot.world.shownBadgeIds.filter((id) => id !== badge.id) : [...snapshot.world.shownBadgeIds, badge.id] })} />
                  {badge.title}
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function KnowledgeGarden() {
  const { snapshot } = useStudioSnapshot();
  if (!snapshot) return <p className="text-sm text-muted">Reading this account&apos;s study record...</p>;
  const { garden } = snapshot.evaluation;
  return (
    <div data-testid="knowledge-garden" className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-reading text-3xl text-heading">Knowledge Garden</h1>
        <p className="max-w-2xl text-sm text-ink">Reading adds plants, revision adds flowers, and completed chapters add stones. A missed day does not remove anything.</p>
      </header>
      <StudioNav />
      {garden.length === 0 ? (
        <p data-testid="garden-empty" className="rounded-3xl border border-line bg-surface p-4 text-sm text-ink">The garden is still soil. It grows when a book, note, highlight, revision, or chapter is saved.</p>
      ) : (
        <ul data-testid="garden-bed" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {garden.map((element) => (
            <li key={element.id} className="flex min-h-28 flex-col items-center justify-center rounded-3xl border border-line bg-selected p-3 text-center">
              <GardenMark kind={element.kind} />
              <span className="mt-2 text-sm text-heading">{element.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StudyPassport() {
  const { snapshot } = useStudioSnapshot();
  if (!snapshot) return <p className="text-sm text-muted">Reading this account&apos;s study record...</p>;
  const chapters = snapshot.record.roadmap?.completedSessions.filter((session) => session.chapterName) ?? [];
  return (
    <div data-testid="study-passport" className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-reading text-3xl text-heading">Study Passport</h1>
        <p className="max-w-2xl text-sm text-ink">Stamps are milestones already stored for this account.</p>
      </header>
      <StudioNav />
      {snapshot.evaluation.passport.length === 0 && chapters.length === 0 ? (
        <p className="text-sm text-muted">No stamps yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {snapshot.evaluation.passport.map((stamp) => (
            <li key={stamp.id} className="rounded-full border border-accent bg-surface px-4 py-3">
              <p className="font-ui text-heading">{stamp.title}</p>
              <p className="text-xs text-muted">{formatWhen(stamp.earnedAt, true)}</p>
            </li>
          ))}
          {chapters.map((chapter) => (
            <li key={chapter.id} className="rounded-full border border-line bg-surface px-4 py-3">
              <p className="font-ui text-heading">{chapter.chapterName}</p>
              <p className="text-xs text-muted">{chapter.subjectName} · {formatWhen(chapter.completedAt, true)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MemoryMuseum() {
  const { snapshot } = useStudioSnapshot();
  if (!snapshot) return <p className="text-sm text-muted">Reading this account&apos;s study record...</p>;
  const comparison = snapshot.evaluation.quizComparison;
  return (
    <div data-testid="memory-museum" className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-reading text-3xl text-heading">Memory Museum</h1>
        <p className="max-w-2xl text-sm text-ink">Saved notes, completed plan blocks, and quiz review lists. A comparison is shown only when two quizzes are saved.</p>
      </header>
      <StudioNav />
      <section className="space-y-2" data-testid="museum-notes">
        <h2 className="font-ui text-lg text-heading">Saved notes</h2>
        {snapshot.record.notes.length === 0 ? <p className="text-sm text-muted">No notes are saved.</p> : (
          <ul className="space-y-2">
            {snapshot.record.notes.slice(0, 8).map((note) => (
              <li key={note.id} className="rounded-2xl border border-line bg-surface p-3 text-sm text-ink">
                <p>{note.quote || "Saved note"}</p>
                <p className="mt-1 text-xs text-muted">{formatWhen(note.createdAt, true)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section data-testid="museum-comparison" className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="font-ui text-lg text-heading">Earlier and later quizzes</h2>
        {!comparison ? (
          <p className="mt-2 text-sm text-ink">Two completed quizzes are needed before a comparison can be shown.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl bg-canvas p-3">
              <p className="text-xs text-muted">Earlier · {comparison.earlier.updatedAt.slice(0, 10)}</p>
              <p className="mt-1 text-sm text-heading">{comparison.earlier.title}</p>
              <p className="text-sm text-ink">{comparison.earlier.weakCount} concepts listed to review</p>
            </article>
            <article className="rounded-2xl bg-canvas p-3">
              <p className="text-xs text-muted">Later · {comparison.later.updatedAt.slice(0, 10)}</p>
              <p className="mt-1 text-sm text-heading">{comparison.later.title}</p>
              <p className="text-sm text-ink">{comparison.later.weakCount} concepts listed to review</p>
            </article>
            <p className="sm:col-span-2 text-sm text-ink">
              {comparison.reviewListShorter
                ? "The later quiz lists fewer concepts to review. This is a count of saved review items, not a score."
                : comparison.reviewListLonger
                  ? "The later quiz lists more concepts to review. That is not treated as a loss of knowledge."
                  : "The two quizzes list the same number of concepts to review."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export function ExperienceBoard({
  snapshot,
  studiedMinutes,
  dailyGoal,
  nextBlock,
}: {
  snapshot: StudioSnapshot;
  studiedMinutes: number | null;
  dailyGoal: number | null;
  nextBlock: string | null;
}) {
  if (snapshot.experience === "studio") {
    return <StudioDashboard snapshot={snapshot} />;
  }
  if (snapshot.experience === "momentum") {
    return (
      <MomentumDashboard
        snapshot={snapshot}
        studiedMinutes={studiedMinutes}
        dailyGoal={dailyGoal}
        nextBlock={nextBlock}
      />
    );
  }
  if (snapshot.experience === "focus") {
    return <FocusDashboard snapshot={snapshot} studiedMinutes={studiedMinutes} dailyGoal={dailyGoal} nextBlock={nextBlock} />;
  }
  return null;
}

function FocusDashboard({
  snapshot,
  studiedMinutes,
  dailyGoal,
  nextBlock,
}: {
  snapshot: StudioSnapshot;
  studiedMinutes: number | null;
  dailyGoal: number | null;
  nextBlock: string | null;
}) {
  const weak = snapshot.record.quizzes.reduce((sum, quiz) => sum + quiz.weakCount, 0);
  return (
    <section data-testid="dashboard-focus" className="grid gap-3 lg:grid-cols-3">
      <article className="rounded-2xl border border-line bg-surface p-4 lg:col-span-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Focus</p>
        <h2 className="mt-1 font-ui text-2xl text-heading">Exam desk</h2>
        <p className="mt-2 text-sm text-ink" data-testid="focus-countdown">
          {snapshot.examDaysLeft == null
            ? "No exam date is saved."
            : snapshot.examDaysLeft < 0
              ? "The saved exam date is in the past."
              : snapshot.examDaysLeft === 0
                ? `${snapshot.record.roadmap?.examName || "Exam"} is dated today.`
                : `${snapshot.record.roadmap?.examName || "Exam"} is in ${snapshot.examDaysLeft} days.`}
        </p>
        <p className="mt-2 text-sm text-ink">{nextBlock ?? "No study block is saved for today."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/roadmap" className="btn-primary text-xs">Open the plan</Link>
          <Link href="/reader" className="btn-secondary text-xs">Continue reading</Link>
          <Link href="/notes" className="btn-secondary text-xs">Review notes</Link>
        </div>
      </article>
      <article className="rounded-2xl border border-line bg-surface p-4" data-testid="focus-analytics">
        <h3 className="font-ui text-lg text-heading">Recorded</h3>
        <ul className="mt-2 space-y-1 text-sm text-ink">
          <li>
            {studiedMinutes == null
              ? "No minutes recorded today."
              : `${studiedMinutes} minutes today${dailyGoal != null ? `, of a ${dailyGoal} minute goal` : ""}.`}
          </li>
          <li>{snapshot.record.notes.length} saved notes.</li>
          <li>{weak === 0 ? "No quiz review items are saved." : `${weak} quiz concepts listed to review.`}</li>
        </ul>
      </article>
    </section>
  );
}

function StudioDashboard({ snapshot }: { snapshot: StudioSnapshot }) {
  const starter = STARTER_COMPANIONS.find((member) => member.style === snapshot.companionStyle);
  const earned = snapshot.rewards ? snapshot.evaluation.stickers.filter((item) => item.earned).length : 0;
  return (
    <section data-testid="dashboard-studio" className="overflow-hidden rounded-[2rem] border border-line bg-surface">
      <div className="grid gap-4 p-4 md:grid-cols-[auto_1fr] md:p-5">
        <CompanionFigure character={starter?.character ?? "leaf"} still className="h-24 w-24" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Studio</p>
          <h2 className="font-reading text-3xl text-heading">{starter?.name ?? "Companion"} is with this desk</h2>
          <p className="mt-1 text-sm text-ink">
            {snapshot.rewards
              ? `${earned} stickers are earned from saved study. Collectibles stay optional.`
              : "Collectibles are turned off. Reading, notes, and the plan stay available."}
          </p>
          <StudyPet world={snapshot.world} milestone={snapshot.evaluation.badges.some((badge) => badge.earned)} />
        </div>
      </div>
      {snapshot.rewards ? (
        <div className="grid grid-cols-2 gap-2 border-t border-line p-3 sm:grid-cols-3">
          {[
            ["/studio", "Sticker Studio"],
            ["/studio/badges", "Badges"],
            ["/studio/room", "Study Room"],
            ["/studio/garden", "Garden"],
            ["/studio/passport", "Passport"],
            ["/studio/museum", "Museum"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="min-h-16 rounded-2xl bg-beige-2 px-3 py-2 text-sm font-medium text-heading">
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MomentumDashboard({
  snapshot,
  studiedMinutes,
  dailyGoal,
  nextBlock,
  onFeeling,
}: {
  snapshot: StudioSnapshot;
  studiedMinutes: number | null;
  dailyGoal: number | null;
  nextBlock: string | null;
  onFeeling?: (feeling: ReadinessFeeling) => void;
}) {
  const percent = studiedMinutes != null && dailyGoal != null && dailyGoal > 0 ? Math.min(100, Math.round((studiedMinutes / dailyGoal) * 100)) : null;
  const suggestion = readinessSuggestion(snapshot.world.readiness.at(-1)?.feeling ?? null);
  return (
    <section data-testid="dashboard-momentum" className="space-y-3">
      <article className="rounded-3xl border border-line bg-surface p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Momentum</p>
        <h2 className="font-ui text-2xl text-heading">Progress against the plan</h2>
        <p className="mt-2 text-sm text-ink" data-testid="momentum-countdown">
          {snapshot.examDaysLeft == null ? "No exam date is saved." : `${snapshot.examDaysLeft} days until the saved exam date.`}
        </p>
        <p className="mt-2 text-3xl text-heading" data-testid="momentum-minutes">
          {studiedMinutes == null ? "No minutes recorded today" : `${studiedMinutes} min recorded today`}
        </p>
        <p className="text-sm text-muted">{dailyGoal == null ? "No daily goal is saved." : `Goal: ${dailyGoal} minutes. This is time, not a score.`}</p>
        {percent != null ? (
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-beige-2" role="progressbar" aria-label="Recorded minutes against the daily goal" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        <p className="mt-3 text-sm text-ink">{suggestion ?? "Choose how this sitting feels, or follow the saved block."} {nextBlock ? `Saved block: ${nextBlock}` : ""}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/sprint" className="btn-primary text-xs">Open Study Sprint</Link>
          <Link href="/progress" className="btn-secondary text-xs">Open Study Progress</Link>
        </div>
      </article>
      <article className="rounded-3xl border border-line bg-surface p-4" data-testid="momentum-analytics">
        <h3 className="font-ui text-lg text-heading">Recorded days</h3>
        <p className="text-sm text-muted">This week: {snapshot.evaluation.weeklyMinutes} minutes. This month: {snapshot.evaluation.monthlyMinutes} minutes. Empty days are not shown.</p>
        {snapshot.evaluation.minutesByDay.length === 0 ? <p className="mt-2 text-sm text-ink">No study minutes are recorded.</p> : (
          <ul className="mt-3 space-y-2">
            {snapshot.evaluation.minutesByDay.slice(-6).map((day) => (
              <li key={day.date} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs text-ink">
                <span>{day.date}</span>
                <span className="h-2 overflow-hidden rounded-full bg-beige-2"><span className="block h-full bg-accent" style={{ width: `${Math.min(100, day.minutes)}%` }} /></span>
                <span>{day.minutes} min</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink" data-testid="momentum-best">
          {snapshot.evaluation.personalBest
            ? `Highest recorded day: ${snapshot.evaluation.personalBest.minutes} minutes on ${snapshot.evaluation.personalBest.date}.`
            : "No personal best is recorded yet."}
        </p>
      </article>
      <ReadinessForm feeling={snapshot.world.readiness.at(-1)?.feeling ?? null} disabled={!snapshot.userId || snapshot.locked} onFeeling={onFeeling} />
    </section>
  );
}

function ReadinessForm({
  feeling,
  disabled,
  onFeeling,
}: {
  feeling: ReadinessFeeling | null;
  disabled: boolean;
  onFeeling?: (feeling: ReadinessFeeling) => void;
}) {
  return (
    <fieldset data-testid="readiness-check" className="rounded-3xl border border-line bg-surface p-4" disabled={disabled || !onFeeling}>
      <legend className="font-ui text-lg text-heading">This sitting</legend>
      <p className="text-sm text-muted">{READINESS_NOTE}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {READINESS_FEELINGS.map((item) => (
          <button key={item.id} type="button" className={`min-h-11 rounded-full border px-3 text-sm ${feeling === item.id ? "border-accent bg-selected text-heading" : "border-line text-ink"}`} onClick={() => onFeeling?.(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function MomentumCheckIn({
  snapshot,
  studiedMinutes,
  dailyGoal,
  nextBlock,
  onFeeling,
}: {
  snapshot: StudioSnapshot;
  studiedMinutes: number | null;
  dailyGoal: number | null;
  nextBlock: string | null;
  onFeeling: (feeling: ReadinessFeeling) => void;
}) {
  return (
    <MomentumDashboard
      snapshot={snapshot}
      studiedMinutes={studiedMinutes}
      dailyGoal={dailyGoal}
      nextBlock={nextBlock}
      onFeeling={onFeeling}
    />
  );
}

function ChoiceRow({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} type="button" disabled={disabled} className={`min-h-11 rounded-full border px-3 text-xs ${value === option ? "border-accent bg-selected text-heading" : "border-line text-ink"}`} onChange={() => undefined} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function StickerMark({ earned, category }: { earned: boolean; category: string }) {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" role="img" aria-label={earned ? `${category} sticker` : `Locked ${category} sticker`}>
      <rect x="6" y="8" width="52" height="48" rx="14" fill={earned ? "var(--selected)" : "var(--bg-secondary)"} stroke="var(--heading)" />
      <path d="M20 34h24M32 22v24" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function BadgeMark({ earned }: { earned: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" role="img" aria-label={earned ? "Unlocked badge" : "Locked badge"}>
      <circle cx="32" cy="28" r="16" fill={earned ? "var(--beige-primary)" : "var(--bg-secondary)"} stroke="var(--heading)" />
      <path d="M24 42l8 12 8-12" fill="var(--selected)" stroke="var(--heading)" />
    </svg>
  );
}

function GardenMark({ kind }: { kind: "plant" | "flower" | "stone" | "path" }) {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" role="img" aria-label={kind}>
      {kind === "plant" ? <path d="M32 50V28M32 34c-10-2-14-12-8-16 8 2 10 10 8 16zM32 40c10-2 14-12 8-16-8 2-10 10-8 16z" fill="var(--beige-primary)" stroke="var(--heading)" /> : null}
      {kind === "flower" ? <g><circle cx="32" cy="28" r="6" fill="var(--accent)" /><circle cx="22" cy="24" r="6" fill="var(--beige-primary)" /><circle cx="42" cy="24" r="6" fill="var(--beige-primary)" /><path d="M32 34v16" stroke="var(--heading)" /></g> : null}
      {kind === "stone" ? <ellipse cx="32" cy="36" rx="16" ry="10" fill="var(--beige-secondary)" stroke="var(--heading)" /> : null}
      {kind === "path" ? <path d="M10 46c12-10 32-10 44 0" fill="none" stroke="var(--heading)" strokeWidth="4" /> : null}
    </svg>
  );
}

function RoomScene({
  world,
  companionStyle,
  stickers,
}: {
  world: LearningWorld;
  companionStyle: CompanionStyle;
  stickers: string[];
}) {
  const starter = STARTER_COMPANIONS.find((member) => member.style === companionStyle);
  const sky = world.background === "dusk" ? "var(--heading)" : world.background === "meadow" ? "var(--success-bg)" : "var(--bg-secondary)";
  return (
    <div data-testid="room-scene" className="overflow-hidden rounded-[2rem] border border-line" style={{ background: sky }}>
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs text-muted">Wall: {world.wall}</p>
          <ul className="mt-2 flex min-h-10 flex-wrap gap-2">
            {stickers.length === 0 ? <li className="text-sm text-ink">No stickers placed.</li> : stickers.map((label) => <li key={label} className="rounded-full bg-surface px-2 py-1 text-xs text-heading">{label}</li>)}
          </ul>
          <div className={`mt-6 rounded-t-3xl border border-line px-4 py-6 ${world.desk === "books" ? "bg-beige-2" : "bg-surface"}`}>
            <p className="text-sm text-heading">Desk · {world.desk}</p>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <CompanionFigure character={starter?.character ?? "leaf"} still className="h-20 w-20" />
          {world.companionAccessory !== "none" ? <p className="text-xs text-heading">{world.companionAccessory}</p> : null}
          <StudyPet world={world} milestone={false} />
        </div>
      </div>
    </div>
  );
}

function StudyPet({ world, milestone }: { world: LearningWorld; milestone: boolean }) {
  return (
    <div data-testid="study-pet" className="mt-2 flex items-center gap-2">
      <svg viewBox="0 0 64 48" className="h-12 w-16" role="img" aria-label="Study pet">
        <ellipse cx="32" cy="30" rx="18" ry="12" fill="var(--beige-primary)" stroke="var(--heading)" />
        <circle cx="22" cy="18" r="6" fill="var(--beige-primary)" stroke="var(--heading)" />
        <circle cx="42" cy="18" r="6" fill="var(--beige-primary)" stroke="var(--heading)" />
        <circle cx="26" cy="30" r="1.4" fill="var(--heading)" />
        <circle cx="38" cy="30" r="1.4" fill="var(--heading)" />
        {world.petAccessory === "ribbon" ? <path d="M24 16h16" stroke="var(--accent)" strokeWidth="3" /> : null}
        {world.petAccessory === "satchel" ? <rect x="40" y="28" width="10" height="8" rx="2" fill="var(--selected)" stroke="var(--heading)" /> : null}
        {milestone ? <path d="M50 8l1.5 3 3 .4-2.2 2.1.6 3L50 15l-3 1.5.6-3-2.2-2.1 3-.4z" fill="var(--accent)" /> : null}
      </svg>
      <p className="text-sm text-heading">{world.petName || "Study pet"}</p>
    </div>
  );
}

export function HubExperienceSection({
  studiedMinutes,
  dailyGoal,
  nextBlock,
}: {
  studiedMinutes: number | null;
  dailyGoal: number | null;
  nextBlock: string | null;
}) {
  const { snapshot, save } = useStudioSnapshot();
  if (!snapshot) return <p data-testid="experience-pending" className="text-sm text-muted">Preparing this experience.</p>;
  if (snapshot.experience === "preserve" || snapshot.experience == null) return null;
  if (snapshot.experience === "momentum") {
    return (
      <MomentumCheckIn
        snapshot={snapshot}
        studiedMinutes={studiedMinutes}
        dailyGoal={dailyGoal}
        nextBlock={nextBlock}
        onFeeling={(feeling) => {
          const date = localIsoDate();
          save({
            ...snapshot.world,
            readiness: [
              ...snapshot.world.readiness.filter((entry) => entry.date !== date),
              { date, feeling },
            ],
          });
        }}
      />
    );
  }
  return (
    <ExperienceBoard
      snapshot={snapshot}
      studiedMinutes={studiedMinutes}
      dailyGoal={dailyGoal}
      nextBlock={nextBlock}
    />
  );
}
