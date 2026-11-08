import type { UniverseProfileId } from "@/lib/universe/types";

/**
 * Daily thought on Today (owner list A, 8 Nov 2026). Written tips, no AI. One a day, the
 * same for the whole day, matched to the student's study style when they have one.
 */

type Group = "all" | "spark" | "laser" | "anchor";

const TIPS: Record<Group, readonly string[]> = {
  all: [
    "Ten focused minutes beat an hour of half-studying. Start the timer and see.",
    "You don't need to feel ready to start. Starting is what makes you ready.",
    "Revise today what you read yesterday. Memory loves a second visit.",
    "Every expert you admire was once confused by the same chapter.",
    "Put the phone in another room for one sprint. Notice how much more you get done.",
    "Small steps every day add up to a finished syllabus.",
    "If a topic feels hard, explain it out loud as if teaching a friend.",
    "Drink water and sit up straight. Your brain works better when your body is cared for.",
    "Sleep is part of studying: it is when your memory saves the day's work.",
    "Mistakes in practice are cheap. Mistakes in the exam are expensive. Practise today.",
    "Compare yourself with who you were last week, not with anyone else.",
    "A short walk between sprints refreshes your focus better than scrolling.",
    "Write down one thing you learned today. That's how you remember it tomorrow.",
    "The best plan is the one you actually follow. Keep it simple.",
  ],
  spark: [
    "Your mind is quick. Give it one topic at a time and it will fly.",
    "Short sprints suit you. Two good 25-minute rounds are a real win.",
    "Feeling scattered? Write the three things you'll do today, then do the first one.",
    "Turn a hard idea into a story or a picture. That's how your memory likes it.",
    "Keep a fixed study time today, even if it's short. Rhythm calms a busy mind.",
    "Worry is energy without a direction. Give it one: start a 10-minute sprint.",
    "Warm food and regular meals keep your focus steadier than you'd think.",
  ],
  laser: [
    "You focus well. Remember to stop for breaks before you feel tired.",
    "Set one clear target for this sprint, then test yourself at the end.",
    "Perfect is not the goal today. Finished is.",
    "If you feel irritated, take a cool five-minute break, then come back.",
    "Teach a topic to a friend. Your clear thinking will help you both.",
    "Don't study through lunch. A fed brain thinks sharper.",
    "Push hard on your hardest subject, then reward yourself with an easy one.",
  ],
  anchor: [
    "Just begin with 10 easy minutes. Once you start, you keep going well.",
    "What you learn properly, you keep. Slow and steady is your strength.",
    "Study your toughest subject before meals, while you're most alert.",
    "Tick one thing off your plan today. Momentum builds from there.",
    "Feeling heavy? Stand up, stretch, and do one quick sprint.",
    "Your calm is a superpower in the exam hall. Trust your preparation.",
    "Try something new today: a diagram, a story, or a quick quiz.",
  ],
};

const GROUPS_FOR: Record<UniverseProfileId, Group[]> = {
  vata: ["spark"],
  pitta: ["laser"],
  kapha: ["anchor"],
  vata_pitta: ["spark", "laser"],
  pitta_kapha: ["laser", "anchor"],
  vata_kapha: ["spark", "anchor"],
  balanced: ["spark", "laser", "anchor"],
};

/** Day number since 1 Jan 2026 in India, so everyone's thought changes at Indian midnight. */
export function indiaDayNumber(now: Date = new Date()): number {
  const india = new Date(now.getTime() + 330 * 60 * 1000);
  const start = Date.UTC(2026, 0, 1);
  return Math.floor((Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate()) - start) / 86_400_000);
}

/** Style tips on most days, general tips every third day. */
export function tipForToday(profileId: UniverseProfileId | null | undefined, now: Date = new Date()): string {
  const day = Math.abs(indiaDayNumber(now));
  const groups = profileId ? GROUPS_FOR[profileId] : null;
  const pool = !groups || day % 3 === 0 ? TIPS.all : groups.flatMap((group) => TIPS[group]);
  return pool[day % pool.length];
}

export const ALL_TIPS = TIPS;
