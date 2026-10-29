"use client";

import React, { useState } from "react";
import { CompanionFigure } from "@/components/companion/CompanionFigure";
import { choiceClass, ui } from "@/components/ui/classes";
import {
  CHARACTER_COPY,
  COMPANION_CHARACTERS,
  COMPANION_STYLES,
  STYLE_COPY,
  STARTER_COMPANIONS,
  type CompanionCharacter,
  type CompanionPrefs,
  type CompanionStyle,
} from "@/lib/companion";

export function CompanionSetup({
  initial,
  fromOnboarding,
  onSave,
}: {
  initial: CompanionPrefs;
  fromOnboarding?: boolean;
  onSave: (prefs: CompanionPrefs) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [style, setStyle] = useState<CompanionStyle>(initial.style);
  const [character, setCharacter] = useState<CompanionCharacter>(initial.character);

  return (
    <form
      data-testid="companion-setup"
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          version: 1,
          name: name.replace(/\s+/g, " ").trim() || CHARACTER_COPY[character].label,
          style,
          character,
          onboarded: true,
        });
      }}
    >
      <div>
        <p className={ui.eyebrow}>Take My Study</p>
        <h2 className={`${ui.heading} mt-2 text-2xl`}>
          {fromOnboarding ? "Choose who studies with you" : "Choose a companion"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Choose a name, a text style, and a simple illustration. This is a study tool, not a
          person, and it does not have feelings.
        </p>
      </div>
      <label className="block" htmlFor="companion-name">
        <span className={ui.label}>Name</span>
        <input
          id="companion-name"
          data-testid="companion-name"
          value={name}
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          className={ui.input}
        />
      </label>
      <fieldset>
        <legend className={ui.label}>How should it speak?</legend>
        <div className="mt-2 space-y-2">
          {COMPANION_STYLES.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`companion-style-${id}`}
              className={choiceClass(style === id)}
              onClick={() => setStyle(id)}
            >
              <span className="flex items-center gap-3">
                <CompanionFigure
                  character={STARTER_COMPANIONS.find((member) => member.style === id)?.character ?? "leaf"}
                  still
                  className="h-12 w-12"
                />
                <span>
                  <strong className="block text-heading">{STYLE_COPY[id].label}</strong>
                  <span className="text-xs text-muted">{STYLE_COPY[id].hint}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={ui.label}>Illustration</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COMPANION_CHARACTERS.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`companion-character-${id}`}
              className={`${choiceClass(character === id)} flex-col items-center py-4`}
              onClick={() => setCharacter(id)}
            >
              <CompanionFigure character={id} />
              <span className="mt-2 text-xs text-heading">{CHARACTER_COPY[id].label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" data-testid="companion-save" className={ui.primary}>
          Save companion
        </button>
        {fromOnboarding ? (
          <a href="/hub" data-testid="companion-skip" className={ui.ghost}>
            Skip for now
          </a>
        ) : null}
      </div>
    </form>
  );
}
