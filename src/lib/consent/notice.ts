/**
 * The notice a parent (or an adult student) reads before agreeing: what ORYZEN keeps,
 * why, who else sees it, and their rights (DPDP Rules 2025, rule 3). Plain language,
 * itemised. Version: CONSENT_NOTICE_VERSION in ./age. A lawyer should review the wording
 * before launch.
 */

export interface NoticeItem {
  what: string;
  why: string;
}

export const NOTICE_DATA: readonly NoticeItem[] = [
  { what: "Name, email address and month and year of birth", why: "To create the account, sign in, and know whether a parent must agree." },
  { what: "Exam, subjects, study plan, sprints and progress", why: "To make and adjust the daily study plan." },
  { what: "Notes, highlights, saved answers and lecture links", why: "So the student can revise them on any device." },
  {
    what: "Books and PDFs",
    why: "Books opened in the reader stay on the student's own phone or computer. Files added to a Subject Vault are stored on our servers so the student can use them on any device.",
  },
  {
    what: "Questions to the AI and the passages they're about",
    why: "To give the answer. They're sent to our AI provider (Google Gemini; OpenAI or Mistral only if Gemini is unavailable). Answers may be kept on our servers so the same question doesn't cost twice.",
  },
  { what: "Study-style answers (if the student takes the quiz)", why: "To suggest a study routine. Never used for advertising." },
  {
    what: "How the student studies (for students 18 and over)",
    why: "Patterns such as re-reading or re-watching help the AI explain things better. Not recorded for students under 18.",
  },
  { what: "Number of AI helps used and their cost", why: "To keep within the daily and monthly limits." },
  { what: "Device sign-ins (up to two devices)", why: "To keep the account safe." },
  {
    what: "Payment record (amount, date, payment reference)",
    why: "For the subscription and tax records. Card and UPI details stay with the payment company (Razorpay or Stripe); we never see them.",
  },
];

export const NOTICE_PROMISES: readonly string[] = [
  "No advertising, and no selling or sharing of a child's data for advertising.",
  "No tracking of a child across other apps or websites.",
  "Data is used only to help the student study.",
];

export const NOTICE_RIGHTS: readonly string[] = [
  "See what we hold about the student, and correct it.",
  "Withdraw consent at any time from the parent page. The student's account then pauses.",
  "Ask us to delete the student's account and data.",
  "Complain to us first; if not resolved, to the Data Protection Board of India.",
];
