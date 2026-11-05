import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import type { Dosha, DoshaScores } from "@/lib/prakriti/config";
import type { CompanionStyle } from "@/lib/companion/types";
import type { FocusSoundId, UniverseProfileId } from "@/lib/universe/types";
import { UNIVERSE_PRESETS } from "@/lib/universe/presets";
import type { SprintDuration } from "@/lib/sprint/types";

/**
 * "My study style" questionnaire (owner brief, 5 Nov 2026).
 * Part 1 uses the classical body-type traits from Ayurveda texts, written in plain English
 * with no Sanskrit terms. Part 2 is our own study questions. Part 1 decides the style
 * (Spark, Laser, Anchor or a mix); Part 2 decides the practical study settings.
 * Wording to be reviewed by the owner (an Ayurveda clinician) before launch.
 */

export interface BodyQuestion {
  id: string;
  topic: string;
  prompt: string;
  /** Each answer leans to one style: Spark (Vata), Laser (Pitta), Anchor (Kapha). */
  options: Record<Dosha, string>;
}

const q = (id: string, topic: string, prompt: string, Vata: string, Pitta: string, Kapha: string): BodyQuestion => ({
  id,
  topic,
  prompt,
  options: { Vata, Pitta, Kapha },
});

export const BODY_QUESTIONS: readonly BodyQuestion[] = [
  q("b-build", "Body", "How would you describe your body build?",
    "Thin and light; I find it hard to put on weight",
    "Medium build with good muscle",
    "Broad and solid; I put on weight easily"),
  q("b-weight", "Body", "How does your weight usually change?",
    "I lose weight quickly, especially when stressed",
    "It stays about the same; I can change it with effort",
    "I gain easily and find it hard to lose"),
  q("b-joints", "Body", "How do your joints and veins look?",
    "Joints are bony and may crack; veins are easy to see",
    "Joints are medium; veins are a little visible",
    "Joints are well covered and firm; veins are hard to see"),
  q("b-skin", "Skin", "What is your skin usually like?",
    "Dry and rough; it cracks in winter",
    "Warm and soft; often reddish, with moles, freckles or pimples",
    "Smooth, thick and slightly oily; cool to touch"),
  q("b-hair", "Hair", "What is your hair like?",
    "Dry, thin or frizzy, with split ends",
    "Fine and soft; early greying or thinning runs in the family",
    "Thick, dense and slightly oily"),
  q("b-eyes", "Eyes", "How are your eyes?",
    "Small and often dry; I blink a lot",
    "Sharp; they turn red easily and bright light bothers me",
    "Large and calm, with thick eyelashes"),
  q("b-temp", "Temperature", "How warm does your body usually feel?",
    "My hands and feet are often cold",
    "I usually feel warm and get hot easily",
    "I feel cool but comfortable most of the time"),
  q("b-weather", "Weather", "Which weather do you find hardest?",
    "Cold, dry and windy weather",
    "Hot, sunny weather",
    "Cold, damp, rainy weather"),
  q("b-sweat", "Sweat", "How much do you sweat?",
    "Very little",
    "A lot, and quickly",
    "A moderate amount, but it starts slowly"),
  q("b-appetite", "Appetite", "What is your appetite like?",
    "Irregular; sometimes very hungry, sometimes I forget to eat",
    "Strong; I get irritable if a meal is late",
    "Steady but mild; I can skip a meal without trouble"),
  q("b-eating", "Appetite", "How do you usually eat?",
    "Quickly, small amounts at odd times",
    "A good amount, and I feel very hungry before meals",
    "Slowly; I enjoy food and feel full on less"),
  q("b-thirst", "Thirst", "How thirsty do you usually feel?",
    "It changes a lot from day to day",
    "Often thirsty",
    "Rarely thirsty"),
  q("b-digestion", "Digestion", "How is your digestion?",
    "Irregular; gas or constipation happen often",
    "Fast; I sometimes get acidity or loose motions",
    "Slow; I feel heavy or sleepy after meals"),
  q("b-food", "Food", "Which food do you like most?",
    "Warm, moist food, and sweet, sour or salty tastes",
    "Cool food and drinks; very spicy food upsets me",
    "Light, warm and spicy food; heavy oily food slows me down"),
  q("b-sleep", "Sleep", "How do you sleep?",
    "Light sleep; I wake easily and sleep less",
    "Sound sleep for a moderate time",
    "Deep, long sleep; I find it hard to wake up"),
  q("b-dreams", "Sleep", "What are your dreams usually like?",
    "Busy dreams: flying, running, falling or being chased",
    "Vivid, colourful dreams, often with arguments or problems to solve",
    "Few dreams, usually calm, often with water or nature"),
  q("b-energy", "Energy", "How is your physical energy?",
    "Comes in bursts; I tire quickly",
    "Good and steady; I like to push myself",
    "Slow to get going, but I can keep going for a long time"),
  q("b-walk", "Movement", "How do you walk and move?",
    "Quickly and lightly; I find it hard to sit still",
    "With purpose, at a firm, even pace",
    "Slowly and steadily"),
  q("b-speech", "Speech", "How do you speak?",
    "Fast and a lot; I jump between topics",
    "Clearly and to the point; I like to win an argument",
    "Slowly and calmly; I use few words"),
  q("b-voice", "Speech", "What is your voice like?",
    "Low or thin; it can crack or go hoarse",
    "Sharp and clear",
    "Deep, soft and pleasant"),
  q("b-learn", "Mind", "How do you learn and remember new things?",
    "I learn quickly but forget quickly",
    "I learn fast and remember clearly",
    "I learn slowly but remember for a long time"),
  q("b-stress", "Mind", "When things go wrong, how do you usually feel first?",
    "Worried, anxious or afraid",
    "Irritated, angry or critical",
    "Calm at first; I withdraw or slow down"),
  q("b-decide", "Mind", "How do you make decisions?",
    "Quickly, and I often change my mind",
    "Quickly and firmly",
    "Slowly, but I stick to them"),
  q("b-routine", "Habits", "How do you follow a daily routine?",
    "My days are irregular; routines don't last long",
    "I like to plan my day and stay on time",
    "I like the same routine every day and dislike change"),
  q("b-money", "Habits", "How do you spend money?",
    "On impulse; it goes quickly",
    "On planned things, often for quality",
    "Carefully; I like to save"),
  q("b-friends", "People", "What are your friendships like?",
    "Many friends, but they change often",
    "A chosen few; I often lead the group",
    "A few close friends for many years"),
];

export interface StudyOption {
  value: string;
  label: string;
}

export interface StudyQuestion {
  id: string;
  topic: string;
  prompt: string;
  options: readonly StudyOption[];
}

export const STUDY_QUESTIONS: readonly StudyQuestion[] = [
  { id: "s-focus", topic: "Focus", prompt: "How long can you study before your mind starts to drift?", options: [
    { value: "15", label: "Less than 15 minutes" },
    { value: "25", label: "About 15 to 25 minutes" },
    { value: "45", label: "About 25 to 45 minutes" },
    { value: "60", label: "More than 45 minutes" },
  ] },
  { id: "s-break", topic: "Breaks", prompt: "How long a break do you need before you can start again?", options: [
    { value: "5", label: "A few minutes is enough" },
    { value: "10", label: "About 10 minutes" },
    { value: "15", label: "15 minutes or more" },
  ] },
  { id: "s-hours", topic: "Study time", prompt: "On a normal day, how much can you really study at home?", options: [
    { value: "60", label: "Less than 1 hour" },
    { value: "120", label: "1 to 2 hours" },
    { value: "180", label: "2 to 4 hours" },
    { value: "240", label: "More than 4 hours" },
  ] },
  { id: "s-time", topic: "Best time", prompt: "When do you study best?", options: [
    { value: "morning", label: "Early morning" },
    { value: "afternoon", label: "Afternoon" },
    { value: "evening", label: "Evening" },
    { value: "night", label: "Late night" },
  ] },
  { id: "s-start", topic: "Starting", prompt: "What is starting a study session like for you?", options: [
    { value: "hard", label: "Hard: I put it off" },
    { value: "plan", label: "Easy if I know exactly what to do" },
    { value: "easy", label: "Usually easy" },
  ] },
  { id: "s-distraction", topic: "Distractions", prompt: "What distracts you most?", options: [
    { value: "phone", label: "My phone" },
    { value: "noise", label: "Noise around me" },
    { value: "tired", label: "Feeling tired or sleepy" },
    { value: "thoughts", label: "My own thoughts or worries" },
  ] },
  { id: "s-explain", topic: "Understanding", prompt: "What helps you understand a hard topic fastest?", options: [
    { value: "story", label: "A story or everyday example" },
    { value: "illustrative", label: "A diagram or picture" },
    { value: "high_yield_revision", label: "Short points or a table" },
    { value: "explain", label: "A clear step-by-step explanation" },
  ] },
  { id: "s-notes", topic: "Notes", prompt: "How do you like your notes?", options: [
    { value: "mind_map", label: "Mind maps or diagrams" },
    { value: "revision_table", label: "Tables and lists" },
    { value: "memory_aid", label: "Short lines and memory tricks" },
    { value: "mixed", label: "I don't really make notes" },
  ] },
  { id: "s-recall", topic: "Memory", prompt: "Three days after studying a chapter, how much do you remember?", options: [
    { value: "most", label: "Most of it" },
    { value: "some", label: "Some of it" },
    { value: "little", label: "Very little" },
  ] },
  { id: "s-exam", topic: "Exams", prompt: "How do you feel as an exam gets close?", options: [
    { value: "calm", label: "Mostly calm" },
    { value: "some", label: "Nervous, but I manage" },
    { value: "very", label: "Very stressed" },
  ] },
  { id: "s-sound", topic: "Sound", prompt: "What do you like around you while studying?", options: [
    { value: "silence", label: "Complete silence" },
    { value: "rain", label: "Soft background sound" },
    { value: "people", label: "People around me" },
  ] },
  { id: "s-help", topic: "Help", prompt: "When you're stuck, what kind of help works best?", options: [
    { value: "teacher", label: "A clear teacher" },
    { value: "buddy", label: "A friendly push" },
    { value: "coach", label: "A firm coach" },
  ] },
];

export type BodyAnswers = Record<string, Dosha>;
export type StudyAnswers = Record<string, string>;

/** Percent leaning to each style from Part 1 (sums to 100). */
export function scoreBody(answers: BodyAnswers): DoshaScores {
  const counts: DoshaScores = { Vata: 0, Pitta: 0, Kapha: 0 };
  let total = 0;
  for (const question of BODY_QUESTIONS) {
    const answer = answers[question.id];
    if (answer === "Vata" || answer === "Pitta" || answer === "Kapha") {
      counts[answer] += 1;
      total += 1;
    }
  }
  if (total === 0) return { Vata: 34, Pitta: 33, Kapha: 33 };
  const Vata = Math.round((counts.Vata / total) * 100);
  const Pitta = Math.round((counts.Pitta / total) * 100);
  return { Vata, Pitta, Kapha: 100 - Vata - Pitta };
}

export const STYLE_NAMES: Record<Dosha, string> = {
  Vata: "Spark",
  Pitta: "Laser",
  Kapha: "Anchor",
};

export interface StyleResult {
  profileId: UniverseProfileId;
  name: string;
  tagline: string;
  scores: DoshaScores;
  /** Plain-English strengths and watch-outs for studying. */
  strengths: string[];
  watchOuts: string[];
}

const STRENGTHS: Record<Dosha, string[]> = {
  Vata: ["You pick up new ideas quickly", "You're creative and enjoy variety"],
  Pitta: ["You focus sharply and like clear goals", "You understand and organise ideas well"],
  Kapha: ["You can study steadily for long stretches", "What you learn properly stays with you"],
};

const WATCH_OUTS: Record<Dosha, string[]> = {
  Vata: ["You may forget quickly, so short, frequent revision helps", "Long sessions tire you; short sprints with breaks work better"],
  Pitta: ["You can push too hard; plan breaks before you burn out", "Exam pressure may make you irritable; keep cool breaks"],
  Kapha: ["Getting started is the hard part; begin with 10 easy minutes", "After heavy meals you may feel sleepy; study before eating"],
};

/** What each style means for studying, in the student's words. */
const STYLE_TAGLINES: Record<UniverseProfileId, string> = {
  vata: "You catch ideas quickly and like variety. Short sprints, stories and pictures, and little-and-often revision suit you.",
  pitta: "You focus sharply and like clear targets. Longer sprints, step-by-step explanations and a quick test at the end suit you.",
  kapha: "You start slowly, then keep going and remember well. A gentle 10-minute start, then longer steady reading suits you.",
  vata_pitta: "Quick and sharp. Short varied sprints that end with a clear check suit you.",
  pitta_kapha: "Focused and steady. Structured work at a calm pace, with a firm revision round, suits you.",
  vata_kapha: "Creative, with a slow start. A soft start, stories and examples, then room to settle in suits you.",
  balanced: "A bit of everything. Start with 25-minute sprints and adjust as you learn what works.",
};

const PAIR_IDS: Record<string, UniverseProfileId> = {
  "Pitta+Vata": "vata_pitta",
  "Kapha+Pitta": "pitta_kapha",
  "Kapha+Vata": "vata_kapha",
};

/**
 * Single style when one leads clearly; a mix when the top two are within 15 points (the same
 * cut-off the saved profile uses, so the reader and plan agree); balanced when all are close.
 */
export function profileIdFromScores(scores: DoshaScores): UniverseProfileId {
  const ranked = (["Vata", "Pitta", "Kapha"] as const).slice().sort((a, b) => scores[b] - scores[a]);
  if (scores[ranked[0]] - scores[ranked[2]] <= 15) return "balanced";
  if (scores[ranked[0]] - scores[ranked[1]] <= 15) {
    return PAIR_IDS[[ranked[0], ranked[1]].sort().join("+")];
  }
  return ranked[0].toLowerCase() as UniverseProfileId;
}

export function styleFromScores(scores: DoshaScores): StyleResult {
  const profileId = profileIdFromScores(scores);
  const preset = UNIVERSE_PRESETS[profileId];
  const ranked = (["Vata", "Pitta", "Kapha"] as const).slice().sort((a, b) => scores[b] - scores[a]);
  const leading = profileId === "balanced" ? ranked : ranked.slice(0, profileId.includes("_") ? 2 : 1);
  return {
    profileId,
    name: preset.modernName,
    tagline: STYLE_TAGLINES[profileId],
    scores,
    strengths: leading.flatMap((dosha) => STRENGTHS[dosha]).slice(0, 3),
    watchOuts: leading.flatMap((dosha) => WATCH_OUTS[dosha]).slice(0, 3),
  };
}

export interface StudySettings {
  sprintMinutes: SprintDuration;
  breakMinutes: number;
  dailyMinutes: number;
  bestTime: string;
  explainFirst: string;
  noteStyle: string;
  focusSound: FocusSoundId;
  helper: CompanionStyle;
  guardOn: boolean;
  tips: string[];
}

const TIME_LABELS: Record<string, string> = {
  morning: "early morning",
  afternoon: "the afternoon",
  evening: "the evening",
  night: "late night",
};

/** Part 2 answers (with the style as a tie-breaker) become concrete study settings. */
export function studySettings(answers: StudyAnswers, style: StyleResult): StudySettings {
  const preset = UNIVERSE_PRESETS[style.profileId];
  const focus = Number(answers["s-focus"]);
  const sprintMinutes = ([15, 25, 45, 60] as const).find((value) => value === focus) ?? preset.sessionMinutes;
  const breakMinutes = Number(answers["s-break"]) || preset.breakMinutes;
  const dailyMinutes = Number(answers["s-hours"]) || 120;
  const tips: string[] = [];
  if (answers["s-start"] === "hard") tips.push("When you can't start, open \"Can't get started?\" on Today and do just 10 minutes.");
  if (answers["s-start"] === "plan") tips.push("Make your exam plan so every day already says what to study.");
  if (answers["s-distraction"] === "phone") tips.push("Turn on Do Not Disturb during sprints; the distraction guard will pause the timer if you leave the app.");
  if (answers["s-distraction"] === "tired") tips.push("Study at your best time and before meals; a short walk wakes you up better than tea.");
  if (answers["s-distraction"] === "thoughts") tips.push("Write the worry down in one line, then start a 10-minute sprint.");
  if (answers["s-recall"] === "little" || answers["s-recall"] === "some") tips.push("Do Morning revision every day: 5 cards, 3 minutes, from your own notes.");
  if (answers["s-exam"] === "very") tips.push("When exam fear rises, breathe in for 4, hold for 4, out for 6, five times. If it feels like too much, talk to someone you trust or call Tele-MANAS on 14416.");
  if (answers["s-time"]) tips.push(`Plan your hardest subject for ${TIME_LABELS[answers["s-time"]] ?? "your best time"}.`);
  const sound: FocusSoundId = answers["s-sound"] === "rain" ? preset.suggestedSound === "silence" ? "rain" : preset.suggestedSound : "silence";
  return {
    sprintMinutes,
    breakMinutes: Math.min(15, Math.max(3, breakMinutes)),
    dailyMinutes,
    bestTime: answers["s-time"] ?? "",
    explainFirst: answers["s-explain"] ?? preset.explanationFormat,
    noteStyle: answers["s-notes"] ?? preset.noteStyle,
    focusSound: sound,
    helper: (answers["s-help"] as CompanionStyle) || preset.companionStyle,
    guardOn: true,
    tips: tips.slice(0, 5),
  };
}

export const STYLE_DISCLAIMER =
  "This is a guide to how you might study best, inspired by traditional Ayurveda body types. It is not a medical test, and not a measure of intelligence or ability. You can change every setting.";

/* Saving and applying (device-private storage, like the rest of the study record). */


export const STUDY_PROFILE_KEY = "oryzen_study_profile_v1";

export interface SavedStudyProfile {
  version: 1;
  savedAt: string;
  bodyAnswers: BodyAnswers;
  studyAnswers: StudyAnswers;
  profileId: UniverseProfileId;
  settings: StudySettings;
}

export function writeStudyProfile(profile: SavedStudyProfile, userId?: string | null): void {
  try {
    writePrivateString(STUDY_PROFILE_KEY, JSON.stringify(profile), userId);
  } catch {
    /* locked record: the result still shows on screen */
  }
}

export function readStudyProfile(userId?: string | null): SavedStudyProfile | null {
  try {
    const raw = readPrivateString(STUDY_PROFILE_KEY, userId);
    const value = raw ? (JSON.parse(raw) as SavedStudyProfile) : null;
    return value && value.version === 1 && value.settings ? value : null;
  } catch {
    return null;
  }
}
