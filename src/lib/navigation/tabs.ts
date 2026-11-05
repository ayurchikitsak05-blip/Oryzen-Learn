import { BookOpen, CircleCheck, House, LayoutGrid } from "lucide-react";
import type { LinkListItem } from "@/components/layout/LinkList";

/**
 * Four tabs: Today, Books, Practice, Tools. Everything else is reached from these.
 * "Me" was renamed "Tools" (owner, 5 Nov 2026) so students know lecture notes, the
 * study style, plan, notes and settings live there.
 */
export const APP_LINKS = [
  { href: "/hub", label: "Today", icon: House },
  { href: "/reader", label: "Books", icon: BookOpen },
  { href: "/practice", label: "Practice", icon: CircleCheck },
  { href: "/me", label: "Tools", icon: LayoutGrid },
] as const;

export const PRACTICE_ITEMS: readonly LinkListItem[] = [
  {
    href: "/revise",
    title: "Morning revision",
    detail: "5 quick cards from your notes, with a daily reminder",
    testId: "practice-revise",
  },
  {
    href: "/reader?lens=test_me",
    title: "Test me",
    detail: "One question at a time on the pages you read",
    testId: "practice-test-me",
  },
  {
    href: "/sprint",
    title: "Study sprint",
    detail: "A focused timer, then quick questions",
    testId: "practice-sprint",
  },
  {
    href: "/progress",
    title: "My scores and progress",
    detail: "Questions right, minutes studied, chapters done",
    testId: "practice-progress",
  },
  {
    href: "/notes",
    title: "My Notes",
    detail: "Highlights and notes to revise from",
    testId: "practice-notes",
  },
];

/** Shown first on Me, under "Highlights" (owner, 5 Nov 2026). */
export const ME_HIGHLIGHTS: readonly LinkListItem[] = [
  { href: "/video", title: "YouTube lecture notes", detail: "Paste a lecture link and get timed notes. Share them free with friends", testId: "me-lectures" },
  { href: "/body-type", title: "My study style", detail: "Find how you focus best and get study settings that suit you", testId: "me-study-style" },
];

/** Tools → "Plan and notes". */
export const ME_ITEMS: readonly LinkListItem[] = [
  { href: "/roadmap", title: "Exam plan and study hours", detail: "Exam date, subjects, daily target", testId: "me-plan" },
  { href: "/companion", title: "Take My Study", detail: "Help to get started, with written tips", testId: "me-take-my-study" },
  { href: "/synthesis", title: "Chapter study book", detail: "Your highlights, notes and lecture notes in one place", testId: "me-study-book" },
  { href: "/vaults", title: "My PDFs by subject", detail: "Your uploaded books, sorted by subject", testId: "me-vaults" },
  { href: "/notes", title: "My Notes", detail: "All your notes and highlights", testId: "me-notes" },
];

/** Tools → "Settings". */
export const SETTINGS_ITEMS: readonly LinkListItem[] = [
  { href: "/personalize", title: "Personalize my space", detail: "Colours, reading size, focus sounds, reminders", testId: "me-personalize" },
  { href: "/pricing", title: "Plan and payment", detail: "Free or Pro", testId: "me-plan-payment" },
  { href: "/auth?form=1", title: "Account and privacy", detail: "Email, password, sign out", testId: "me-account" },
];
