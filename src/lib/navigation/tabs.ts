import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleCheck,
  House,
  LayoutGrid,
  Library,
  NotebookText,
  RotateCcw,
  Sprout,
  StickyNote,
  Timer,
  Video,
} from "lucide-react";
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

/**
 * Desktop left menu (owner, 27 Nov 2026, after VaidyaGenie): every place one click away,
 * grouped the way students think. Phones keep the four bottom tabs above.
 */
export const SIDEBAR_GROUPS = [
  {
    id: "study",
    label: "Study",
    items: [
      { href: "/hub", label: "Today", icon: House },
      { href: "/reader", label: "Books", icon: BookOpen },
      { href: "/video", label: "Lectures", icon: Video },
      { href: "/vaults", label: "My subjects", icon: Library },
      { href: "/synthesis", label: "Chapter study book", icon: NotebookText },
    ],
  },
  {
    id: "practice",
    label: "Practice",
    items: [
      { href: "/revise", label: "Revision", icon: RotateCcw },
      { href: "/practice", label: "Practice", icon: CircleCheck },
      { href: "/focus", label: "Focus timer", icon: Timer },
      { href: "/notes", label: "My notes", icon: StickyNote },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    items: [
      { href: "/roadmap", label: "Exam plan", icon: CalendarDays },
      { href: "/progress", label: "Progress", icon: BarChart3 },
      { href: "/body-type", label: "My study style", icon: Sprout },
    ],
  },
] as const;

export const SIDEBAR_FOOTER = { href: "/me", label: "All tools and settings", icon: LayoutGrid } as const;

export const PRACTICE_ITEMS: readonly LinkListItem[] = [
  {
    href: "/reader?tip=diagram",
    title: "Flowcharts, tables and mind maps",
    detail: "Turn any page of your book into a diagram or key points",
    testId: "practice-diagrams",
  },
  {
    href: "/voice-notes",
    title: "Voice notes",
    detail: "Record formulas and definitions in your own voice for revision",
    testId: "practice-voice-notes",
  },
  {
    href: "/techniques",
    title: "Study techniques",
    detail: "Pomodoro, active recall and more, matched to your study style",
    testId: "practice-techniques",
  },
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
  { href: "/video", title: "YouTube lecture topics", detail: "Paste a lecture link. Jump to each topic and mark your own. Free", testId: "me-lectures" },
  { href: "/body-type", title: "My study style", detail: "Find how you focus best and get study settings that suit you", testId: "me-study-style" },
];

/** Tools → "Plan and notes". */
export const ME_ITEMS: readonly LinkListItem[] = [
  { href: "/roadmap", title: "Exam plan and study hours", detail: "Exam date, subjects, daily target", testId: "me-plan" },
  { href: "/companion", title: "Take My Study", detail: "Help to get started, with written tips", testId: "me-take-my-study" },
  { href: "/focus", title: "Focus timer", detail: "Study and break blocks; End session saves your minutes", testId: "me-focus-timer" },
  { href: "/synthesis", title: "Chapter study book", detail: "Your highlights, notes and lecture notes in one place", testId: "me-study-book" },
  { href: "/vaults", title: "My PDFs by subject", detail: "Your uploaded books, sorted by subject", testId: "me-vaults" },
  { href: "/notes", title: "My Notes", detail: "All your notes and highlights", testId: "me-notes" },
];

/** Tools → "Settings". */
export const SETTINGS_ITEMS: readonly LinkListItem[] = [
  { href: "/personalize", title: "Personalize my space", detail: "Colours, reading size, focus sounds, reminders", testId: "me-personalize" },
  { href: "/pricing", title: "Plan and payment", detail: "Free or Pro, renewal date, stop auto-renew", testId: "me-plan-payment" },
  { href: "/me/account", title: "Account and privacy", detail: "Email, password, sign out", testId: "me-account" },
  { href: "/me/data", title: "Download my study data", detail: "A copy of your notes, cards and plans, any time", testId: "me-data" },
  { href: "/privacy", title: "Privacy notice", detail: "What we keep, your rights, parent consent", testId: "me-privacy" },
  { href: "/parent", title: "For parents", detail: "Give or withdraw consent for your child", testId: "me-parent" },
];
