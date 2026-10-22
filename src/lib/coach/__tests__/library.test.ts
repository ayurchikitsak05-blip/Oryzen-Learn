import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COACH_ACTION_HANDLERS } from "../actions";
import { COACH_MESSAGES } from "../messages";
import { COACH_ACTIONS, COACH_TRIGGERS, COACH_VOICE_IDS } from "../types";

const BANNED =
  /wasted|lazy|everyone else is ahead|you will finish the syllabus tonight|rank 1|top of the class|beat your batch|your vata mind|anxious — you need|improves retention/i;

describe("coach message library", () => {
  it("has at least 300 unique ids and texts", () => {
    const ids = COACH_MESSAGES.map((message) => message.id);
    const texts = COACH_MESSAGES.map((message) => message.text);
    expect(ids.length).toBeGreaterThanOrEqual(300);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("covers every style × trigger pair", () => {
    for (const style of COACH_VOICE_IDS) {
      for (const trigger of COACH_TRIGGERS) {
        const rows = COACH_MESSAGES.filter(
          (message) => message.style === style && message.trigger === trigger
        );
        expect(rows.length, `${style} ${trigger}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("keeps copy school-appropriate and free of shame promises", () => {
    for (const message of COACH_MESSAGES) {
      expect(message.text.length).toBeGreaterThan(12);
      expect(message.text).not.toMatch(BANNED);
      expect(COACH_ACTIONS).toContain(message.recommendedAction);
    }
  });

  it("maps every action id to a real handler name", () => {
    for (const action of COACH_ACTIONS) {
      expect(typeof COACH_ACTION_HANDLERS[action]).toBe("string");
      expect(COACH_ACTION_HANDLERS[action].length).toBeGreaterThan(3);
    }
  });

  it("does not import a paid provider on the selector path", () => {
    const files = ["selector.ts", "persist.ts", "detect.ts", "messages.ts", "actions.ts", "index.ts"];
    const joined = files
      .map((name) => readFileSync(join(__dirname, "..", name), "utf8"))
      .join("\n");
    expect(joined).not.toMatch(/@google\/genai|openai|mistral|generateText|GEMINI_API_KEY|ai\/gateway/i);
  });
});
