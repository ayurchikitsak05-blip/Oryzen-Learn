"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanionFigure } from "@/components/companion/CompanionFigure";
import { choiceClass, ui } from "@/components/ui/classes";
import { FocusSoundPanel } from "@/components/universe/FocusSoundPanel";
import { UniverseOffer } from "@/components/universe/UniverseOffer";
import {
  CHARACTER_COPY,
  COMPANION_CHARACTERS,
  COMPANION_STYLES,
  createCompanionMember,
  STYLE_COPY,
  switchCompanion,
  type CompanionCharacter,
  type CompanionStore,
  type CompanionStyle,
} from "@/lib/companion";
import { readCompanionStore } from "@/lib/companion/persist";
import {
  applyUniversePreset,
  buildDayPlan,
  customizeUniverse,
  deactivateUniverse,
  DEFAULT_UNIVERSE_PREFS,
  focusSounds,
  readDayPlan,
  readUniversePrefs,
  rebuildUniversePlan,
  recommendedProfileForStudent,
  resetUniversePreset,
  skipUniverse,
  UNIVERSE_DISCLAIMER,
  UNIVERSE_PRESET_LIST,
  UNIVERSE_PRESETS,
  writeDayPlan,
  type DayPlan,
  type UniversePrefs,
} from "@/lib/universe";

const NOTE_LABELS: Record<UniversePrefs["noteStyle"], string> = {
  mind_map: "Mind map",
  revision_table: "Revision table",
  memory_aid: "Memory aid",
  mixed: "Mixed notes",
};

export function UniverseStudio({
  userId,
  fromOnboarding,
}: {
  userId: string;
  fromOnboarding?: boolean;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<UniversePrefs>(DEFAULT_UNIVERSE_PREFS);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [companion, setCompanion] = useState<CompanionStore>(() => readCompanionStore(null));
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const recommendedId = useMemo(() => recommendedProfileForStudent(userId), [userId]);
  const showOffer =
    Boolean(fromOnboarding) && !prefs.activated && !prefs.skipped && !prefs.customized && !customizeOpen;
  const preset = UNIVERSE_PRESETS[prefs.activated ? prefs.profileId : recommendedId];

  const refresh = (nextPrefs?: UniversePrefs) => {
    setPrefs(nextPrefs ?? readUniversePrefs(userId));
    setPlan(readDayPlan(userId));
    setCompanion(readCompanionStore(userId));
  };

  useEffect(() => {
    const nextPrefs = readUniversePrefs(userId);
    if (!readDayPlan(userId)) {
      writeDayPlan(buildDayPlan({ prefs: nextPrefs }), userId);
    }
    refresh(nextPrefs);
    setHydrated(true);
  }, [userId]);

  if (!hydrated) {
    return (
      <p data-testid="universe-loading" className={ui.loading}>
        Opening your study universe…
      </p>
    );
  }

  const create = () => {
    refresh(applyUniversePreset(recommendedId, userId).prefs);
    setCustomizeOpen(false);
    router.replace("/universe");
  };

  const openCustomize = () => {
    if (!readUniversePrefs(userId).activated) {
      refresh(applyUniversePreset(recommendedId, userId, { customized: true }).prefs);
    }
    setCustomizeOpen(true);
  };

  const openReader = () => {
    focusSounds.stop();
    refresh(skipUniverse(userId));
    router.push("/reader");
  };

  if (showOffer) {
    return (
      <UniverseOffer
        profileId={recommendedId}
        onCreate={create}
        onCustomize={openCustomize}
        onOpenReader={openReader}
      />
    );
  }

  return (
    <div data-testid="universe-dashboard" className="space-y-6">
      <div>
        <p className={ui.eyebrow}>My Study Universe</p>
        <h1 className={`${ui.heading} mt-2 text-3xl md:text-4xl`}>{preset.modernName}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{preset.tagline}</p>
      </div>
      <p className={ui.notice}>{UNIVERSE_DISCLAIMER}</p>

      <section className={`${ui.cardPad} space-y-3`} data-testid="universe-preview">
        <p className={ui.eyebrow}>{preset.prakritiLabel}</p>
        <ul className="grid gap-2 text-sm text-ink md:grid-cols-2">
          <li>Theme: {preset.modernName}</li>
          <li>
            {prefs.sessionMinutes}-minute focus · {prefs.breakMinutes}-minute breaks
          </li>
          <li>
            Reminders: {prefs.reminderTone}, {prefs.reminderFrequency}
          </li>
          <li>Explanations: {prefs.explanationFormat}</li>
          <li>Notes: {NOTE_LABELS[prefs.noteStyle]}</li>
          <li>Companion: {companion.prefs.name || preset.companionName}</li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        {!prefs.activated ? (
          <button type="button" data-testid="universe-activate" className={ui.primary} onClick={create}>
            Activate this universe
          </button>
        ) : null}
        <button
          type="button"
          data-testid="universe-toggle-customize"
          className={ui.secondary}
          onClick={() => setCustomizeOpen((open) => !open)}
        >
          {customizeOpen ? "Hide settings" : "Customize My Universe"}
        </button>
        <button
          type="button"
          data-testid="universe-reset"
          className={ui.ghost}
          onClick={() => refresh(resetUniversePreset(userId))}
        >
          Reset to recommended
        </button>
        <button
          type="button"
          data-testid="universe-plain-reader"
          className={ui.ghost}
          onClick={openReader}
        >
          Return to a plain reader
        </button>
      </div>

      {customizeOpen ? (
        <UniverseCustomize
          prefs={prefs}
          onChange={(next) => refresh(customizeUniverse(next, userId))}
          onSelectPreset={(profileId) =>
            refresh(
              applyUniversePreset(profileId, userId, {
                dailyGoalMinutes: prefs.dailyGoalMinutes,
                customized: true,
              }).prefs
            )
          }
        />
      ) : null}

      <section className={`${ui.card} space-y-3`} data-testid="universe-plan">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={ui.eyebrow}>Today&apos;s plan</p>
            <h2 className={`${ui.heading} mt-1 text-lg`}>Automatic StudySprint schedule</h2>
          </div>
          <label className="text-sm text-muted">
            Daily goal
            <input
              data-testid="universe-daily-goal"
              type="number"
              min={15}
              max={360}
              step={15}
              value={prefs.dailyGoalMinutes}
              className={`${ui.input} ml-2 w-24`}
              onChange={(event) =>
                refresh(customizeUniverse({ dailyGoalMinutes: Number(event.target.value) }, userId))
              }
            />
          </label>
        </div>
        <ol className="space-y-2">
          {(plan?.blocks ?? []).map((block) => (
            <li
              key={block.id}
              data-testid={`universe-block-${block.kind}`}
              className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"
            >
              <span>{block.label}</span>
              <span className="text-muted">{block.minutes} min</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">{plan?.nextSuggestedSession}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/sprint" data-testid="universe-start-sprint" className={ui.primary}>
            Start a StudySprint
          </Link>
          <Link href="/reader" data-testid="universe-open-reader" className={ui.secondary}>
            Open the PDF reader
          </Link>
          <button
            type="button"
            data-testid="universe-reschedule"
            className={ui.ghost}
            onClick={() => {
              rebuildUniversePlan(userId, { missed: true });
              refresh();
            }}
          >
            Reschedule missed session
          </button>
        </div>
      </section>

      <section className={`${ui.card} space-y-3`} data-testid="universe-companions">
        <p className={ui.eyebrow}>Study companions</p>
        <h2 className={`${ui.heading} text-lg`}>Switch between text-only companions</h2>
        <p className="text-sm text-muted">
          Each one is a writing style with a simple illustration. None of them is a person.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {companion.collection.map((member) => (
            <button
              key={member.id}
              type="button"
              data-testid={`universe-companion-${member.id}`}
              className={choiceClass(member.id === companion.activeId)}
              onClick={() => setCompanion(switchCompanion(member.id, userId))}
            >
              <span className="flex items-center gap-3">
                <CompanionFigure character={member.character} className="h-14 w-14" />
                <span>
                  <strong className="block text-heading">{member.name}</strong>
                  <span className="text-xs text-muted">{STYLE_COPY[member.style].label}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
        <AddCompanionForm
          onAdd={(input) => setCompanion(createCompanionMember(input, userId))}
        />
        <Link href="/companion" className={ui.ghost}>
          Open companion chat
        </Link>
      </section>

      <FocusSoundPanel
        prefs={prefs}
        onChange={(patch) => refresh(customizeUniverse(patch, userId))}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="universe-turn-off"
          className={ui.ghost}
          onClick={() => {
            focusSounds.stop();
            refresh(deactivateUniverse(userId));
          }}
        >
          Turn off personalization
        </button>
        <Link href="/hub" className={ui.ghost}>
          Back to Learning Space
        </Link>
      </div>
    </div>
  );
}

function UniverseCustomize({
  prefs,
  onChange,
  onSelectPreset,
}: {
  prefs: UniversePrefs;
  onChange: (patch: Partial<UniversePrefs>) => void;
  onSelectPreset: (profileId: UniversePrefs["profileId"]) => void;
}) {
  return (
    <section data-testid="universe-customize" className={`${ui.card} space-y-4`}>
      <h2 className={`${ui.heading} text-lg`}>Customize individual settings</h2>
      <fieldset>
        <legend className={ui.label}>Profile</legend>
        <div className="mt-2 grid gap-2">
          {UNIVERSE_PRESET_LIST.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`universe-preset-${item.id}`}
              className={choiceClass(prefs.profileId === item.id)}
              onClick={() => onSelectPreset(item.id)}
            >
              <span>
                <strong className="block text-heading">{item.modernName}</strong>
                <span className="text-xs text-muted">
                  {item.prakritiLabel} · {item.tagline}
                </span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className={ui.label}>Focus minutes</span>
        <select
          data-testid="universe-session-minutes"
          className={ui.input}
          value={prefs.sessionMinutes}
          onChange={(event) => onChange({ sessionMinutes: Number(event.target.value) as 15 | 25 | 45 | 60 })}
        >
          {[15, 25, 45, 60].map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={ui.label}>Break minutes</span>
        <input
          data-testid="universe-break-minutes"
          type="number"
          min={3}
          max={15}
          className={ui.input}
          value={prefs.breakMinutes}
          onChange={(event) => onChange({ breakMinutes: Number(event.target.value) })}
        />
      </label>
      <label className="block">
        <span className={ui.label}>Explanation format</span>
        <select
          data-testid="universe-explanation"
          className={ui.input}
          value={prefs.explanationFormat}
          onChange={(event) =>
            onChange({ explanationFormat: event.target.value as UniversePrefs["explanationFormat"] })
          }
        >
          <option value="story">Story</option>
          <option value="structured">Structured</option>
          <option value="steady">Steady</option>
          <option value="mixed">Mixed</option>
        </select>
      </label>
      <label className="block">
        <span className={ui.label}>Note style</span>
        <select
          data-testid="universe-note-style"
          className={ui.input}
          value={prefs.noteStyle}
          onChange={(event) => onChange({ noteStyle: event.target.value as UniversePrefs["noteStyle"] })}
        >
          <option value="mind_map">Mind map</option>
          <option value="revision_table">Revision table</option>
          <option value="memory_aid">Memory aid</option>
          <option value="mixed">Mixed</option>
        </select>
      </label>
      <label className="block">
        <span className={ui.label}>Reminder tone</span>
        <select
          data-testid="universe-reminder-tone"
          className={ui.input}
          value={prefs.reminderTone}
          onChange={(event) =>
            onChange({ reminderTone: event.target.value as UniversePrefs["reminderTone"] })
          }
        >
          <option value="gentle">Gentle</option>
          <option value="clear">Clear</option>
          <option value="steady">Steady</option>
        </select>
      </label>
      <label className="block">
        <span className={ui.label}>Reminder frequency</span>
        <select
          data-testid="universe-reminder-frequency"
          className={ui.input}
          value={prefs.reminderFrequency}
          onChange={(event) =>
            onChange({ reminderFrequency: event.target.value as UniversePrefs["reminderFrequency"] })
          }
        >
          <option value="frequent">Frequent</option>
          <option value="moderate">Moderate</option>
          <option value="sparse">Sparse</option>
        </select>
      </label>
      <label className="block">
        <span className={ui.label}>Companion style</span>
        <select
          data-testid="universe-companion-style"
          className={ui.input}
          value={prefs.companionStyle}
          onChange={(event) =>
            onChange({ companionStyle: event.target.value as UniversePrefs["companionStyle"] })
          }
        >
          {COMPANION_STYLES.map((style) => (
            <option key={style} value={style}>
              {STYLE_COPY[style].label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function AddCompanionForm({
  onAdd,
}: {
  onAdd: (input: {
    name: string;
    style: CompanionStyle;
    character: CompanionCharacter;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [style, setStyle] = useState<CompanionStyle>("buddy");
  const [character, setCharacter] = useState<CompanionCharacter>("leaf");

  return (
    <form
      data-testid="universe-add-companion"
      className="space-y-3 rounded-xl border border-line px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd({
          name: name.replace(/\s+/g, " ").trim() || "Nia",
          style,
          character,
        });
        setName("");
      }}
    >
      <p className="text-sm font-medium text-heading">Add another text companion</p>
      <label className="block">
        <span className={ui.label}>Name</span>
        <input
          data-testid="universe-companion-name"
          className={ui.input}
          maxLength={24}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="block">
        <span className={ui.label}>Writing style</span>
        <select
          data-testid="universe-companion-add-style"
          className={ui.input}
          value={style}
          onChange={(event) => setStyle(event.target.value as CompanionStyle)}
        >
          {COMPANION_STYLES.map((id) => (
            <option key={id} value={id}>
              {STYLE_COPY[id].label}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className={ui.label}>Illustration</legend>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {COMPANION_CHARACTERS.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`universe-companion-character-${id}`}
              className={`${choiceClass(character === id)} flex-col items-center py-2`}
              onClick={() => setCharacter(id)}
            >
              <CompanionFigure character={id} className="h-12 w-12" />
              <span className="mt-1 text-[11px] text-heading">{CHARACTER_COPY[id].label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <button type="submit" data-testid="universe-companion-add" className={ui.secondary}>
        Save companion
      </button>
    </form>
  );
}
