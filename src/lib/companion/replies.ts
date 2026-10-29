import { notesHref, quizHref, readerHref } from "@/lib/sprint/plan";
import type { SprintSession } from "@/lib/sprint/types";
import type { CompanionPrefs, CompanionStyle, CompanionTurn } from "./types";

export const COMPANION_MOCK_NOTICE =
  "Study draft from your companion (not a live model). It cannot feel, and it is not a person.";

function topicFrom(question: string): string {
  const cleaned = question
    .replace(/^(please\s+)?(explain|what is|how does|why does|tell me about)\s+/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
  return cleaned.slice(0, 80);
}

function titleOf(session: SprintSession | null): string {
  if (!session) return "your next page";
  return session.topic || session.chapter || session.subject || session.goal;
}

function styleBody(
  style: CompanionStyle,
  name: string,
  intent: "break" | "quiz" | "plan" | "resume" | "explain" | "encourage" | "other",
  session: SprintSession | null,
  topic: string
): string {
  const title = titleOf(session);
  if (style === "teacher") {
    if (intent === "break") {
      return `${name} here — a study companion, not a person. Close the page for ${session?.breakMinutes ?? 5} minutes. When you return, reread the last heading on “${title}” before you continue.`;
    }
    if (intent === "quiz") {
      return `${name} here — a study companion, not a person. First review the passage on “${title}”. Then take Test Me on that same page and write the items you miss. ${session ? `Stay on ${quizHref(session)}.` : ""}`;
    }
    if (intent === "plan") {
      return session
        ? `${name} here — a study companion, not a person. Work ${session.durationMinutes} minutes on “${session.goal}”, then stop for a ${session.breakMinutes}-minute break. After the break, say the main idea in one sentence.`
        : `${name} here — a study companion, not a person. Open StudySprint, choose 15, 25, 45, or 60 minutes, and name one goal from the PDF.`;
    }
    if (intent === "resume") {
      return session
        ? `${name} here — a study companion, not a person. Resume “${session.goal}” where you left “${title}”. Reader: ${readerHref(session)}. Notes: ${notesHref(session)}.`
        : `${name} here — a study companion, not a person. If a StudySprint is waiting, open it and press resume.`;
    }
    if (intent === "explain") {
      return `${name} here — a study companion, not a person. For “${topic}”, open that page and highlight one sentence, then tap Explain. Close the book and say the idea in one sentence of your own. This draft does not invent the textbook answer.`;
    }
    if (intent === "encourage") {
      return `${name} here — a study companion, not a person. Choose the smallest check: start the sprint or answer one quiz item on “${title}”.`;
    }
    return `${name} here — a study companion, not a person. Return to “${title}”, then explain the last paragraph in your own words.`;
  }

  if (style === "coach") {
    if (intent === "break") {
      return `${name} here. One clear next step: stand up for the break you set. Come back when the timer says resume.`;
    }
    if (intent === "quiz") {
      return `${name} here. One clear next step: open Test Me on “${title}” and mark every miss. ${session ? `Go to ${quizHref(session)}.` : ""}`;
    }
    if (intent === "plan") {
      return session
        ? `${name} here. One clear next step: stay with ${session.durationMinutes} minutes on “${session.goal}”, then take the ${session.breakMinutes}-minute break.`
        : `${name} here. One clear next step: open StudySprint and lock a 15, 25, 45, or 60 minute block.`;
    }
    if (intent === "resume") {
      return session
        ? `${name} here. One clear next step: resume “${session.goal}”. Reader: ${readerHref(session)}.`
        : `${name} here. One clear next step: open StudySprint and press resume.`;
    }
    if (intent === "explain") {
      return `${name} here. One clear next step: for “${topic}”, open the page, highlight the stuck line, and tap Explain. Then write one sentence from the page, not from memory.`;
    }
    if (intent === "encourage") {
      return `${name} here. One clear next step: start the sprint or answer one quiz item. Stop there.`;
    }
    return `${name} here. One clear next step: open “${title}” and finish the current block.`;
  }

  if (style === "guide") {
    if (intent === "break") {
      return `When you are ready — I'm ${name}, a calm study companion, not a person. Leave “${title}” for ${session?.breakMinutes ?? 5} minutes. There is no rush.`;
    }
    if (intent === "quiz") {
      return `When you are ready — I'm ${name}, a calm study companion, not a person. Take Test Me on “${title}” when it feels right, then keep the misses. ${session ? `Open ${quizHref(session)}.` : ""}`;
    }
    if (intent === "plan") {
      return session
        ? `When you are ready — I'm ${name}, a calm study companion, not a person. Sit with “${session.goal}” for ${session.durationMinutes} minutes, then rest for ${session.breakMinutes}.`
        : `When you are ready — I'm ${name}, a calm study companion, not a person. Open StudySprint and choose a length that feels sustainable.`;
    }
    if (intent === "resume") {
      return session
        ? `When you are ready — I'm ${name}, a calm study companion, not a person. Return to “${session.goal}” at your pace. Reader: ${readerHref(session)}.`
        : `When you are ready — I'm ${name}, a calm study companion, not a person. If a StudySprint is waiting, open it when you want to continue.`;
    }
    if (intent === "explain") {
      return `When you are ready — I'm ${name}, a calm study companion, not a person. Stay with one line about “${topic}”. Tap Explain, then rest the idea in your own words.`;
    }
    if (intent === "encourage") {
      return `When you are ready — I'm ${name}, a calm study companion, not a person. One page on “${title}” is enough.`;
    }
    return `When you are ready — I'm ${name}, a calm study companion, not a person. Return to “${title}” without hurrying.`;
  }

  if (intent === "break") {
    return `Hi — I'm ${name}, your study companion. A short break is part of the plan. Leave “${title}”, then come back when you are ready.`;
  }
  if (intent === "quiz") {
    return `Hi — I'm ${name}, your study companion. Let’s check “${title}” with Test Me, then keep the weak lines for later. ${session ? `Open ${quizHref(session)}.` : ""}`;
  }
  if (intent === "plan") {
    return session
      ? `Hi — I'm ${name}, your study companion. Stay with ${session.durationMinutes} minutes on “${session.goal}”. After that we take a ${session.breakMinutes}-minute break.`
      : `Hi — I'm ${name}, your study companion. Open StudySprint, pick 15, 25, 45, or 60 minutes, and name one goal from the PDF.`;
  }
  if (intent === "resume") {
    return session
      ? `Hi — I'm ${name}, your study companion. You still have “${session.goal}” on the clock. Resume it, then open the reader for “${title}”.`
      : `Hi — I'm ${name}, your study companion. If a StudySprint is waiting, open it and press resume.`;
  }
  if (intent === "explain") {
    return `Hi — I'm ${name}, your study companion. Let’s study “${topic}” from the page. Highlight the sentence that feels stuck, tap Explain, and tell me which line is still unclear. I will not pretend this draft is a live explanation.`;
  }
  if (intent === "encourage") {
    return `Hi — I'm ${name}, your study companion. You do not have to finish the chapter. One timed block on “${title}” is enough for now.`;
  }
  return `Hi — I'm ${name}, your study companion. Let’s return to “${title}” and take the next small step together.`;
}

let replySerial = 0;

export function companionReply(input: {
  question: string;
  prefs: CompanionPrefs;
  unfinished?: SprintSession | null;
  now?: string;
}): CompanionTurn {
  const asked = input.question.replace(/\s+/g, " ").trim();
  const low = asked.toLowerCase();
  const session = input.unfinished ?? null;
  let intent: "break" | "quiz" | "plan" | "resume" | "explain" | "encourage" | "other" = "other";
  if (/break|rest|tired|pause/i.test(low)) intent = "break";
  else if (/quiz|test|mcq|revise|revision|weak/i.test(low)) intent = "quiz";
  else if (/plan|session|sprint|schedule|today|target/i.test(low)) intent = "plan";
  else if (/unfinished|resume|left off|continue|pending/i.test(low)) intent = "resume";
  else if (/explain|how|why|what is|mean|concept|difficult|hard/i.test(low)) intent = "explain";
  else if (/encourage|stuck|overwhelm|motivat/i.test(low)) intent = "encourage";

  replySerial += 1;
  return {
    id: `companion-${Date.now().toString(36)}-${replySerial.toString(36)}`,
    role: "companion",
    text: `${styleBody(input.prefs.style, input.prefs.name, intent, session, topicFrom(asked) || titleOf(session))} ${COMPANION_MOCK_NOTICE}`,
    mocked: true,
    createdAt: input.now ?? new Date().toISOString(),
  };
}

export function openingCompanionTurn(prefs: CompanionPrefs, unfinished?: SprintSession | null): CompanionTurn {
  return companionReply({
    question: unfinished ? "resume unfinished work" : "plan a study session",
    prefs,
    unfinished,
  });
}

export function repliesDifferByStyle(question: string, session?: SprintSession | null): boolean {
  const buddy = companionReply({
    question,
    prefs: { version: 1, name: "Aarav", style: "buddy", character: "leaf", onboarded: true },
    unfinished: session,
  }).text;
  const coach = companionReply({
    question,
    prefs: { version: 1, name: "Kabir", style: "coach", character: "lamp", onboarded: true },
    unfinished: session,
  }).text;
  const teacher = companionReply({
    question,
    prefs: { version: 1, name: "Meera", style: "teacher", character: "stone", onboarded: true },
    unfinished: session,
  }).text;
  const guide = companionReply({
    question,
    prefs: { version: 1, name: "Tara", style: "guide", character: "kite", onboarded: true },
    unfinished: session,
  }).text;
  return buddy !== coach && coach !== teacher && buddy !== teacher && guide !== buddy && guide !== coach && guide !== teacher;
}
