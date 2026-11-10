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
  { what: "Notes, highlights and saved answers", why: "So the student can revise them on any device." },
  { what: "Books and PDFs the student opens", why: "Kept on the student's own phone or computer. A passage is sent to the AI only when the student asks about it." },
  { what: "Questions to the AI and the passages they're about", why: "To give the answer. They're sent to Google's Gemini service, which doesn't use them to train its models on our paid plan." },
  { what: "Study-style answers (if the student takes the quiz)", why: "To suggest a study routine. Never used for advertising." },
  { what: "Number of AI helps used and their cost", why: "To keep within the daily and monthly limits." },
  { what: "Device sign-ins (up to two devices)", why: "To keep the account safe." },
  { what: "Payment record (amount, date, payment reference)", why: "For the subscription and tax records. Card and UPI details stay with the payment company (Razorpay); we never see them." },
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
