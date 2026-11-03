import { describe, expect, it } from "vitest";
import { companionReply } from "@/lib/companion";
import {
  fillTokens,
  isSafetyMessage,
  libraryAnswer,
  SAFETY_REPLY,
  STARTERS,
  toneForStyle,
} from "@/lib/companion/library";
import type { SprintSession } from "@/lib/sprint/types";

const prefs = (style: "buddy" | "coach" | "teacher" | "guide") => ({
  version: 1 as const,
  name: "Meera",
  style,
  character: "stone" as const,
  onboarded: true,
});

describe("Take My Study reply library", () => {
  it("has six starting buttons, each with three tones and three follow-ups", () => {
    expect(STARTERS).toHaveLength(6);
    for (const starter of STARTERS) {
      expect(Object.keys(starter.replies).sort()).toEqual(["coach", "friend", "teacher"]);
      expect(starter.followUps).toHaveLength(3);
      for (const reply of Object.values(starter.replies)) {
        expect(reply).not.toMatch(/\bI feel\b|\bI am (a )?human\b|\bI'm a person\b/i);
      }
    }
  });

  it("maps Buddy to Friend, Coach to Coach, and Teacher and Guide to Teacher", () => {
    expect(toneForStyle("buddy")).toBe("friend");
    expect(toneForStyle("coach")).toBe("coach");
    expect(toneForStyle("teacher")).toBe("teacher");
    expect(toneForStyle("guide")).toBe("teacher");
  });

  it("fills tokens from the sprint, with plain fallbacks when there is none", () => {
    expect(fillTokens("Read {start} for {minutes} minutes in {chapter}.")).toBe(
      "Read your next page for 25 minutes in this chapter."
    );
    const session = {
      pageNumber: 65,
      durationMinutes: 45,
      breakMinutes: 8,
      chapter: "Motion in a Plane",
      topic: "",
      goal: "Read 4.11",
      subject: "Physics",
    } as unknown as SprintSession;
    expect(fillTokens("Read {start} for {minutes} minutes in {chapter}.", { session })).toBe(
      "Read page 65 for 45 minutes in Motion in a Plane."
    );
  });

  it("answers a tapped button in the chosen tone, without the free-text draft notice", () => {
    const friend = companionReply({ question: "I can't get started", prefs: prefs("buddy") });
    const coach = companionReply({ question: "I can't get started", prefs: prefs("coach") });
    expect(friend.text).toMatch(/Honestly, starting is the worst part/);
    expect(coach.text).toMatch(/Tiny start, no excuses/);
    expect(friend.text).not.toMatch(/not a live model/);
  });

  it("puts safety first, in English, Hindi and Marathi", () => {
    for (const text of ["I want to die", "thinking about suicide", "मरना चाहता हूँ", "मला जगायचं नाही", "I'm really not okay"]) {
      expect(isSafetyMessage(text)).toBe(true);
      expect(libraryAnswer(text, "coach")?.text).toBe(SAFETY_REPLY);
    }
    expect(SAFETY_REPLY).toMatch(/14416/);
    expect(isSafetyMessage("I'm tired")).toBe(false);
    expect(isSafetyMessage("I can't get started")).toBe(false);
    expect(isSafetyMessage("Explain the motion of a dying star")).toBe(false);
  });

  it("catches the everyday ways a student writes it, including curly apostrophes and Hinglish", () => {
    for (const text of [
      "i wanna die",
      "I don’t want to live",
      "i dont wanna live anymore",
      "do not want to live",
      "I wish I was dead",
      "i feel like dying",
      "cutting myself again",
      "I want to KILL MYSELF",
      "kms",
      "I am really not okay",
      "im not ok",
      "marna chahta hu",
      "marna chahti hoon",
      "jeena nahi chahta",
      "mujhe mar jana hai",
      "मुझे मरना है",
      "मर जाना चाहता हूं",
      "मला मरायचं आहे",
      "मला जगायचे नाही",
    ]) {
      expect(isSafetyMessage(text), text).toBe(true);
    }
    // Broad on purpose: a stressed figure of speech also gets the helpline reply.
    expect(isSafetyMessage("this exam is going to kill me")).toBe(true);
  });

  it("says plainly that it is not a person", () => {
    expect(libraryAnswer("are you a real person?", "buddy")?.text).toMatch(/not a person/);
  });

  it("leaves other typed questions to the existing replies", () => {
    expect(libraryAnswer("Plan my session", "teacher")).toBeNull();
  });
});
