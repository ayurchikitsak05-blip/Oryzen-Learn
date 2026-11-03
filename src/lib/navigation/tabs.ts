import { BookOpen, CircleCheck, House, UserRound } from "lucide-react";
import type { LinkListItem } from "@/components/layout/LinkList";

/** Four tabs: Today, Books, Practice, Me. Everything else is reached from these. */
export const APP_LINKS = [
  { href: "/hub", label: "Today", icon: House },
  { href: "/reader", label: "Books", icon: BookOpen },
  { href: "/practice", label: "Practice", icon: CircleCheck },
  { href: "/me", label: "Me", icon: UserRound },
] as const;

export const PRACTICE_ITEMS: readonly LinkListItem[] = [
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

export const ME_ITEMS: readonly LinkListItem[] = [
  { href: "/roadmap", title: "Exam plan and study hours", detail: "Exam date, subjects, daily target", testId: "me-plan" },
  { href: "/companion", title: "Take My Study", detail: "Help to get started, with written tips", testId: "me-take-my-study" },
  { href: "/video", title: "Lecture notes", detail: "Notes from YouTube lectures", testId: "me-lectures" },
  { href: "/synthesis", title: "Chapter study book", detail: "Your highlights, notes and lecture notes in one place", testId: "me-study-book" },
  { href: "/vaults", title: "My PDFs by subject", detail: "Your uploaded books, sorted by subject", testId: "me-vaults" },
  { href: "/notes", title: "My Notes", detail: "All your notes and highlights", testId: "me-notes" },
  { href: "/body-type", title: "Study style (optional)", detail: "Spark, Laser or Anchor tips", testId: "me-study-style" },
  { href: "/personalize", title: "Personalize my space", detail: "Colours, reading size, focus sounds", testId: "me-personalize" },
  { href: "/pricing", title: "Plan and payment", detail: "Free or Pro", testId: "me-plan-payment" },
  { href: "/auth?form=1", title: "Account and privacy", detail: "Email, password, sign out", testId: "me-account" },
];
