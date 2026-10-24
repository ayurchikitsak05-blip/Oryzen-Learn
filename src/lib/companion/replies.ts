import { notesHref, quizHref, readerHref } from "@/lib/sprint/plan";
import type { SprintSession } from "@/lib/sprint/types";
import type { CompanionPrefs, CompanionStyle, CompanionTurn } from "./types";

export const COMPANION_MOCK_NOTICE =
  "Study draft from your companion (not a live model). It cannot feel, and it is not a person.";

function opener(prefs: CompanionPrefs): string {
  if (prefs.style === "teacher") return `${prefs.name} here — a study companion, not a person.`;
  if (prefs.style === "coach") return `${prefs.name} here. One clear next step.`;
  return `Hi — I'm ${prefs.name}, your study companion.`;
}

function unfinishedLine(session: SprintSession | null): string {
  if (!session) return "If a StudySprint is waiting, open it and press resume.";
  const title = session.topic || session.chapter || session.subject || session.goal;
  return `You still have “${title}” on the clock. Resume the sprint, then open the reader.`;
}

function planLine(session: SprintSession | null): string {
  if (!session) {
    return "Open StudySprint, pick a 15, 25, 45, or 60 minute block, and name one goal from the PDF.";
  }
  return `Stay with ${session.durationMinutes} minutes on “${session.goal}”. After that, take a ${session.breakMinutes}-minute break.`;
}

function explainLine(style: CompanionStyle): string {
  if (style === "teacher") {
    return "Highlight the hard sentence in the reader and use Explain or Ask My Book so the answer stays inside that page.";
  }
  if (style === "coach") {
    return "Do not guess from memory. Open the page, highlight the line, and ask the reader to explain it.";
  }
  return "Let’s look at the page together. Highlight the sentence that feels stuck, then tap Explain.";
}

export function companionReply(input: {
  question: string;
  prefs: CompanionPrefs;
  unfinished?: SprintSession | null;
  now?: string;
}): CompanionTurn {
  const asked = input.question.replace(/\s+/g, " ").trim();
  const low = asked.toLowerCase();
  const session = input.unfinished ?? null;
  const parts = [opener(input.prefs)];

  if (/break|rest|tired|pause/i.test(low)) {
    parts.push(
      input.prefs.style === "coach"
        ? "Stand up for the break you set. Come back when the timer says resume."
        : "A short break is part of the plan. Leave the page, then return when the break ends."
    );
  } else if (/quiz|test|mcq|revise|revision|weak/i.test(low)) {
    parts.push("Use Test Me on the same passage, then mark the weak lines for revision.");
    if (session) parts.push(`Open the quiz from this sprint: stay on ${quizHref(session)}.`);
  } else if (/plan|session|sprint|schedule|today|target/i.test(low)) {
    parts.push(planLine(session));
  } else if (/unfinished|resume|left off|continue|pending/i.test(low)) {
    parts.push(unfinishedLine(session));
    if (session) parts.push(`Reader: ${readerHref(session)}. Notes: ${notesHref(session)}.`);
  } else if (/explain|how|why|what is|mean|concept|difficult|hard/i.test(low)) {
    parts.push(explainLine(input.prefs.style));
    if (input.prefs.style === "teacher") {
      parts.push("After you read the explanation, say the idea in one sentence without looking.");
    } else {
      parts.push("Then tell me which line still feels unclear.");
    }
  } else if (/encourage|stuck|overwhelm|motivat/i.test(low)) {
    parts.push(
      input.prefs.style === "buddy"
        ? "You do not have to finish the chapter. One timed block is enough for now."
        : "Pick the smallest next action: start the sprint or answer one quiz item."
    );
  } else {
    parts.push(unfinishedLine(session));
    parts.push(explainLine(input.prefs.style));
  }

  parts.push(COMPANION_MOCK_NOTICE);

  return {
    id: `companion-${Date.now().toString(36)}`,
    role: "companion",
    text: parts.join(" "),
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
