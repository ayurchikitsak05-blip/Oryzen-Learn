import type { SprintSession } from "@/lib/sprint/types";
import type { CompanionStyle } from "./types";

/**
 * Take My Study reply library (written replies, no AI).
 * Source of truth: the "Take My Study — Reply Library" doc, 3 Nov 2026.
 * Tokens in braces are filled from the student's current sprint; each has a fallback.
 */

export type LibraryTone = "teacher" | "friend" | "coach";

export type FollowUp =
  | { label: string; kind: "reply"; reply: string; action?: { label: string; href: string } }
  | { label: string; kind: "link"; href: string }
  | { label: string; kind: "safety" };

export interface Starter {
  id: string;
  label: string;
  replies: Record<LibraryTone, string>;
  followUps: FollowUp[];
}

export function toneForStyle(style: CompanionStyle): LibraryTone {
  if (style === "buddy") return "friend";
  if (style === "coach") return "coach";
  return "teacher";
}

export const STARTER_PROMPT = "What's stopping you right now?";

export const STARTERS: readonly Starter[] = [
  {
    id: "cant-start",
    label: "I can't get started",
    replies: {
      teacher: "Starting is the hardest step, so let's make it very small. Read only {start} for 10 minutes, then decide whether to go on.",
      friend: "Honestly, starting is the worst part. Let's do just {start} for 10 minutes. You can stop after that, deal?",
      coach: "Tiny start, no excuses. {start}, 10 minutes, timer on. Go.",
    },
    followUps: [
      { label: "OK, start 10 minutes", kind: "link", href: "/sprint" },
      {
        label: "Even that feels hard",
        kind: "reply",
        reply: "Then just open the page and read the heading out loud. That's all. Once you've read one line, the next one usually comes easier.",
        action: { label: "Open the page", href: "/reader" },
      },
      {
        label: "Move it to tomorrow",
        kind: "reply",
        reply: "Done. Rest well, and come back tomorrow. Your plan will spread today's pages over the rest of the week.",
        action: { label: "Back to Today", href: "/hub" },
      },
    ],
  },
  {
    id: "tired",
    label: "I'm too tired",
    replies: {
      teacher: "A tired brain can still revise well. Skip new pages tonight and do a few quick questions on what you've already read.",
      friend: "Tired days happen. Let's not force a whole chapter: a few easy questions on what you've read and you're done for tonight.",
      coach: "Low energy, small target: 5 minutes of quick questions. Small wins still count.",
    },
    followUps: [
      { label: "Do 5 minutes of questions", kind: "link", href: "/reader?lens=test_me" },
      {
        label: "I need to rest",
        kind: "reply",
        reply: "Good call. Drink some water and sleep on time. Your plan will wait, and a few questions in the morning keep you on track.",
        action: { label: "Back to Today", href: "/hub" },
      },
      { label: "Try 10 minutes anyway", kind: "link", href: "/sprint" },
    ],
  },
  {
    id: "dont-understand",
    label: "I don't understand this chapter",
    replies: {
      teacher: "Let's find exactly where it stopped making sense. Open the page, press and hold the first line you don't understand, and tap Explain.",
      friend: "That happens to everyone with {chapter}. Open the page, hold the line that confuses you, and tap Explain.",
      coach: "Confusion means you've found what to learn. Find the first line that loses you, hold it, tap Explain.",
    },
    followUps: [
      { label: "Open the page", kind: "link", href: "/reader" },
      {
        label: "The whole chapter is confusing",
        kind: "reply",
        reply: "Then start with the headings only. Use Explain on each heading first; they give you the map before the details.",
        action: { label: "Open the chapter", href: "/reader" },
      },
      {
        label: "Explain it like a story",
        kind: "reply",
        reply: "Hold the line and tap Story. It turns the idea into a short everyday example.",
        action: { label: "Open the page", href: "/reader" },
      },
    ],
  },
  {
    id: "too-much",
    label: "There's too much to do",
    replies: {
      teacher: "When everything feels urgent, do only today's part. Your plan has already split the syllabus: today is {today}.",
      friend: "It looks huge when you see it all at once. Forget the rest for now. Today is just {today}.",
      coach: "Ignore the mountain, climb today's step: {today}, {minutes} minutes. That's the whole job.",
    },
    followUps: [
      { label: "Start today's part", kind: "link", href: "/sprint" },
      {
        label: "Today's part is too big",
        kind: "reply",
        reply: "Let's cut it in half. Do the first half now; the rest moves into this week.",
        action: { label: "Start the smaller part", href: "/sprint" },
      },
      { label: "Show me my whole plan", kind: "link", href: "/roadmap" },
    ],
  },
  {
    id: "exam-fear",
    label: "My exam is close and I'm scared",
    replies: {
      teacher: "Feeling nervous before an exam is normal; it shows you care. With the time you have left, the best use of it is revising what you've already read.",
      friend: "Exam fear is really common. You've already covered a lot. Let's make today about revising, not starting new things.",
      coach: "The time left is real time. Use that nervous energy on 15 minutes of practice questions right now.",
    },
    followUps: [
      { label: "Practise 10 questions", kind: "link", href: "/reader?lens=test_me" },
      {
        label: "Help me calm down first",
        kind: "reply",
        reply: "Try this: breathe in for 4 counts, hold for 4, breathe out for 6. Do it five times. Then pick one small topic.",
        action: { label: "I'm ready", href: "/sprint" },
      },
      { label: "I'm really not okay", kind: "safety" },
    ],
  },
  {
    id: "talk-me-into-it",
    label: "Just talk me into it",
    replies: {
      teacher: "Every page you read today is one less to worry about later. Today's part keeps your plan on track.",
      friend: "Future you will be so glad you did this. {minutes} minutes, then you're free.",
      coach: "Don't break your streak tonight. {minutes} minutes. Start.",
    },
    followUps: [
      { label: "Fine, let's go", kind: "link", href: "/sprint" },
      {
        label: "Give me one reason",
        kind: "reply",
        reply: "A little every day beats a lot once a week: you remember more and panic less before exams.",
        action: { label: "Start", href: "/sprint" },
      },
      {
        label: "Later",
        kind: "reply",
        reply: "OK. Come back when you're ready; today's plan will be waiting on the Today screen.",
        action: { label: "Back to Today", href: "/hub" },
      },
    ],
  },
];

export const SAFETY_REPLY =
  "I'm a study helper, so I can't help with this the way a person can. Please talk to someone you trust today: a parent, a teacher or a friend. You can also call Tele-MANAS on 14416. It's free, open day and night, and you can talk in Hindi, English and other Indian languages.";

export const SAFETY_PHONE_HREF = "tel:14416";

/**
 * Worrying phrases, in English, Hinglish, Hindi and Marathi. Checked before any other reply.
 * Deliberately broad: a stressed "this exam will kill me" also gets the helpline reply,
 * which is the safer mistake. The owner reviews this list before launch.
 */
export const SAFETY_PATTERNS: readonly RegExp[] = [
  // English
  /\b(want|wanna|going|gonna|wish|need) (to )?die\b/,
  /\bwish i (was|were) dead\b/,
  /\b(feel like|thinking of|thinking about) dying\b/,
  /\bkill(ing)? (myself|me)\b/,
  /\b(hurt|hurting|cut|cutting|harm|harming) myself\b/,
  /\bunalive\b/,
  /\bkms\b/,
  /\bend (my life|it all|everything)\b/,
  /\bsuicid/,
  /\bself ?harm/,
  /\bno (point|reason) (in |to )?(living|live|being alive)\b/,
  /\b(do not|dont|don't|never) (want|wanna) (to )?(live|be alive|exist)\b/,
  /\bbetter off dead\b/,
  /\b(i'm|i am|im) (really |really really )?not (okay|ok)\b/,
  // Hinglish (romanized Hindi)
  /\bmar(na)? (jaana|jana|jau|jaun|jaaun)\b/,
  /\bmarna (chahta|chahti|hai)\b/,
  /\bmar jana hai\b/,
  /\bjeena nahi\b/,
  /\bjeene ka (mann|man) nahi\b/,
  /\bkhudkushi\b/,
  /\baatmahatya\b/,
  // Hindi
  /मरना चाह/,
  /मरना है/,
  /मर जा/,
  /आत्महत्या/,
  /जीना नहीं/,
  /जीने का मन नहीं/,
  /ख़ुदकुशी|खुदकुशी/,
  // Marathi
  /जगायचं नाही|जगायचे नाही/,
  /मरायच/,
  /मरून जा/,
];

/** Lower-case, straight apostrophes, single spaces: so "I DON’T  want to live" still matches. */
export function normalizeForSafety(text: string): string {
  return text.toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
}

export function isSafetyMessage(text: string): boolean {
  const value = normalizeForSafety(text);
  return SAFETY_PATTERNS.some((pattern) => pattern.test(value));
}

export const SOMETHING_ELSE_LABEL = "Something else is stopping me";
export const SOMETHING_ELSE_REPLY =
  "That's okay, not everything fits a button. Pick the one that's closest, or write it below in a few words. Whatever it is, starting with just 10 minutes usually helps.";

export const NOT_A_PERSON_REPLY = "No. I'm a set of written study tips inside ORYZEN Learn, not a person.";

export interface LibraryContext {
  session?: SprintSession | null;
}

function startRef(session: SprintSession | null | undefined): string {
  if (session && session.pageNumber > 0) return `page ${session.pageNumber}`;
  const topic = session?.topic || session?.chapter || session?.goal;
  return topic ? `the first page of “${topic}”` : "your next page";
}

function todayRef(session: SprintSession | null | undefined): string {
  if (!session) return "today's pages";
  const what = session.topic || session.chapter || session.goal;
  const subject = session.subject ? `${session.subject}: ` : "";
  return what ? `${subject}${what}` : "today's pages";
}

export function fillTokens(text: string, context: LibraryContext = {}): string {
  const session = context.session ?? null;
  const values: Record<string, string> = {
    start: startRef(session),
    today: todayRef(session),
    minutes: String(session?.durationMinutes ?? 25),
    break: String(session?.breakMinutes ?? 5),
    chapter: session?.chapter || session?.topic || "this chapter",
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function normalized(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase().replace(/[’']/g, "'");
}

export function findStarter(text: string): Starter | undefined {
  const value = normalized(text);
  return STARTERS.find((starter) => normalized(starter.label) === value);
}

export function findFollowUp(text: string): FollowUp | undefined {
  const value = normalized(text);
  for (const starter of STARTERS) {
    const found = starter.followUps.find((followUp) => normalized(followUp.label) === value);
    if (found) return found;
  }
  return undefined;
}

export type LibraryAnswer =
  | { kind: "safety"; text: string }
  | { kind: "starter"; text: string; starter: Starter }
  | { kind: "followUp"; text: string; followUp: FollowUp }
  | { kind: "notAPerson"; text: string };

/** Picks a written reply for a tapped button or typed text. Returns null when the library has none. */
export function libraryAnswer(
  text: string,
  style: CompanionStyle,
  context: LibraryContext = {}
): LibraryAnswer | null {
  if (isSafetyMessage(text)) return { kind: "safety", text: SAFETY_REPLY };
  const starter = findStarter(text);
  if (starter) {
    return { kind: "starter", text: fillTokens(starter.replies[toneForStyle(style)], context), starter };
  }
  const followUp = findFollowUp(text);
  if (followUp?.kind === "reply") {
    return { kind: "followUp", text: fillTokens(followUp.reply, context), followUp };
  }
  if (followUp?.kind === "safety") return { kind: "safety", text: SAFETY_REPLY };
  if (normalized(text) === normalized(SOMETHING_ELSE_LABEL)) {
    return { kind: "notAPerson", text: SOMETHING_ELSE_REPLY };
  }
  if (/\b(are you|r u) (real|a (real )?person|human)\b/i.test(text)) {
    return { kind: "notAPerson", text: NOT_A_PERSON_REPLY };
  }
  return null;
}
