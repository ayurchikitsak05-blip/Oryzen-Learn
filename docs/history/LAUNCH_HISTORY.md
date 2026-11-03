# ORYZEN Learn launch history

A plain-language record of each change on the way to launch: what was wrong, what changed, how it was checked, and what the owner needs to decide. Newest first. The owner decides; the engineer fixes; the observer reviews; this file records.

---

## 2026-11-03 (night) · Redesign, part 3: first-run screens

### Change: one-minute setup for new students
- **Problem:** a new student landed on Today with "No plan yet" and a seven-step plan form (chapters, commitments, sleep times) before anything useful happened.
- **Fix:** a new `/welcome` screen. Step 1: tap the class or exam (Class 10, 11, 12, NEET, JEE, College), subjects and exam month; this becomes a plan of about 2 hours a day. Step 2: upload a first PDF (the reader opens with a "press and hold a line, tap Explain" tip) or add a book later. Today's "Make my exam plan" now opens this screen; the full form stays on the plan screen.
- **How the plan is made:** chapters are named "Chapter 1, 2, …" using rough NCERT chapter counts (for example Class 12 Physics 14, NEET Biology 32); students rename or remove them on the plan. Boards default to February so the plan finishes before mid-February exams. The plan is created on the plan screen once it knows the student has none, so it syncs to the account like any other plan.
- **Left out on purpose:** the "From my syllabus" NCERT books on the design (needs the NCERT precompute and a legal check) and the age question with parent approval (needs the DPDP decision below).
- **Tested:** unit tests for months, suggestions, subject cleaning, Hindi subject names and the planner accepting the result; screen tests for the welcome flow and Today. CI passed.
- **Observer:** CHANGES NEEDED on the first pass. Fixed: on a shared phone one student's answers could become another student's plan (answers are now tied to the student and expire after a day); offline, a plan could be made that then clashed with the account's plan; Hindi subject names merged into one; exam dates could be a day away; an existing plan silently ignored the new answers. Second pass: APPROVE WITH FOLLOW-UPS; its two points (students close to the exam couldn't pick this year's month; a slow sign-in check could freeze the buttons) are fixed.

### Owner decisions
- **Under-18 students (DPDP Act):** collecting data from minors needs verifiable parent consent. Decide how (parent email or phone OTP) before public launch; the screen is ready to add the question.
- **Chapter counts** are approximate and can be replaced with real chapter names per class later.

---

## 2026-11-03 (evening) · Redesign, part 2: "My Notes", and a daily AI-help allowance

**Owner decision (3 Nov):** don't use the word "notebook" anywhere students see it, so the app isn't confused with Google's product. Chosen word: **My Notes**.

### Change: "Notebook" is now "My Notes"
- Every student-visible label, button and message now says My Notes ("Save to My Notes", "Open My Notes"). Saved data keys, routes and the API are unchanged, so nobody loses notes.

### Change: daily AI helps
- **Problem:** AI calls had no per-day limit, only a ₹70 monthly wallet per student, and Free got the same as Pro.
- **Fix:** Free gets 5 new AI helps a day, Pro (paid or class-sponsored) 40. Saved answers never count. Illustrate, Story and Ask My Book count as two. The day resets at midnight India time. When the helps are used, the reader says so plainly ("Saved answers, reading, notes and practice still work") and no paid call is made. Monthly safety net: Free ₹25, Pro ₹70; reaching it now shows a message too instead of a silent basic answer. Files: `src/lib/ai/daily-allowance.ts`, `src/lib/ai/gateway.ts`, `src/app/api/ai/lens/route.ts`.
- **Tested:** unit tests for the counting rules and India day; gateway tests that a used-up allowance makes no paid call, saved answers still come back, a double help is refused when one is left, and the next day gets the real answer.
- **Observer:** CHANGES NEEDED on the first pass. Fixed: a blocked request was being saved as that passage's answer (the student would never get the real one); the first monthly cap (₹5) would have run out after about a week; a monthly cap gave a silent fallback; one leftover "notebook". Left as follow-ups: two requests sent at the same instant can both use the last help (the monthly cap still limits money); if the usage table can't be read, the daily limit doesn't apply (monthly cap still does).

### Owner decision
- Daily helps (5 / 40) and monthly safety nets (₹25 / ₹70) can be changed in one file. At about ₹0.17 a help, a Free student who uses every help every day costs about ₹25 a month; most will use far less.

---

## 2026-11-03 (afternoon) · Redesign, part 1: four tabs, Today screen, Take My Study replies

**Owner decisions (3 Nov):** keep the study style (optional, renamed Spark, Laser, Anchor, with a disclaimer); Take My Study uses written replies, no AI; YouTube lecture notes, Master Study Book, Personalize, alarm quiz and distraction guard stay; studio, garden, badges, passport, museum and Study Universe are hidden. Screens were agreed on the design canvas first.

### Change: four tabs and a Today screen
- **Problem:** home was eight equal tiles and six tabs; nothing said what to do next.
- **Fix:** tabs are now Today, Books, Practice and Me. Today shows one Start button for the day's plan (or "Make my exam plan"), revision, "Can't get started?", progress and the last book. Practice and Me list the kept features. Studio, Study Universe and the institute dashboard redirect to Today; their code is kept. Files: `src/components/hub/TodayHome.tsx`, `src/lib/navigation/tabs.ts`, `src/lib/access/gate.ts`.
- **Correction to the earlier review:** new students already get the free plan at sign-up, so they normally land on home, not the price page.

### Change: Take My Study written replies
- **What:** six starting buttons ("I can't get started", "I'm too tired", ...) answered from the reply library doc in Teacher, Friend or Coach tone, with follow-up buttons that lead to a sprint, the reader or questions. File: `src/lib/companion/library.ts`.
- **Safety:** worrying words in English, Hinglish, Hindi or Marathi always get the Tele-MANAS 14416 reply and a Call button, before anything else. The list is deliberately broad ("this exam will kill me" also gets it). Owner to review the word list before launch.

- **Tested:** CI 86 test files, 495 tests passed; type check clean; build passed. Preview deployment built; signed-in screens not yet checked in a browser (needs a test login).
- **Observer:** CHANGES NEEDED on the first pass (safety words missed common phrasings such as "i wanna die", curly apostrophes and Hinglish). Fixed and re-tested with every phrase it listed. Other follow-ups fixed: double taps, old labels, links into hidden screens.

### Still to build (next slices)
- First-run screens (exam setup, first book, first win), reader AI-help allowance and cost tags, Personalize with the Universe themes and sounds, YouTube lecture notes via Gemini, alarm quiz, distraction guard, study style 10-question version, prices and Razorpay webhook.

---

## 2026-11-03 · Checks on every change, and paid access locked to real payments

**Starting point:** `main` is what Production runs (21 Oct). Most of the work since then lives on `feature/soft-beige-premium-ui` (58 commits, the Soft Beige study app on Preview). The password hotfix (PR #1) was open and not in that branch. Nothing ran the tests automatically.

### Change 1: automatic checks on every PR
- **Problem:** nobody could prove the app still builds or passes its tests after a change.
- **Fix:** a GitHub workflow (`.github/workflows/ci.yml`) runs the unit tests, type check and production build, plus a lint report. A second job starts a throwaway Supabase database, applies every migration and runs the database tests in `supabase/tests/`.
- **Found along the way:** the lockfile was made on a Mac and misses Linux parts of three packages, so a clean Linux install failed. CI adds the missing parts at the same versions; the lockfile itself is unchanged.
- **Result on the branch:** 81 test files, 451 tests passed; type check clean; build succeeded. Lint reports 32 older React-rule errors (lint is skipped during Vercel builds, so they don't block deploys; recorded as an open item).

### Change 2: the password-takeover hotfix brought into the study app
- **Problem:** the study app branch still let a failed sign-in replace the account's password. The database part was already removed; this removes the app part.
- **Fix:** merged PR #1's branch. Failed sign-in now says to use an email link; recovery goes through `/auth/reset-password`.

### Change 3: paid access only after a verified payment
- **Problems (launch audit, 3 Nov):**
  1. Any signed-in student could call the database's checkout function directly and become a paid member without paying.
  2. If the payment setting on Vercel was missing or misspelled, the app silently switched to "placeholder" mode, where pressing Confirm granted paid access for free.
  3. A student could make themselves an admin or paid on their first profile save, add themselves to any coaching institute (and read its files), or raise their own plan and booster balance.
  4. The quota page accepted "upgrade plan" and "buy booster" with no payment.
- **Fix:**
  - Migration `20261103000001_lock_paid_access_and_profile_columns.sql`: payment completion now only runs for the server, after Razorpay or Stripe confirms; the old student-callable function is switched off; profile role, access and institute, and the plan and booster balance, can't be set by a student.
  - App: `src/lib/supabase/admin.ts` completes a checkout with the server key after verification; Production refuses checkout instead of using placeholder mode; quota route only meters; profile save no longer touches the institute.
  - Also: the in-browser institute demo and the Gemini model diagnostic are hidden on Production; checkout refuses to start if the server key is missing, so a student is never charged without getting access; two scratch test scripts that contained a demo account password were removed.
- **Tested:** database tests on a real local Supabase (all 10 pass: the old function and the new one are refused for a student; self-upgrades are ignored; a privileged first profile is reset; usage counting still works; the server path grants access, refuses the wrong provider or student, and is safe to retry). Unit tests for the payment-mode rule and source guards.
- **Observer:** APPROVE WITH FOLLOW-UPS. Its one pre-merge point (a vault change that would have permanently locked away another student's notes on a shared browser) was reverted; the original issue it addressed is low-risk and stays as an open item. Its other points were fixed: checkout now refuses when the server key is missing, and a production server outside Vercel also counts as Production.
- **Not tested:** a real Razorpay or Stripe payment on Preview. That needs the Preview keys and a test purchase.

### Owner decisions and actions
- **Apply the migration** to Learn Preview (`gxthbneiryvdrsduktza`) first, then Production (`mazzciufouqcxmwaacyu`), **together with the deploy** of this code. Old code can't complete checkouts once the migration runs.
- **Set `SUPABASE_SERVICE_ROLE_KEY`** in Vercel (Preview and Production) if it isn't there. Checkout needs it.
- **Change the password** of the demo account `oryzen.owner.demo@example.com`: it was in two scratch files in the repo history, and the repo is public.

## Open items
- [ ] Apply `20261103000001` to Preview, then Production with the deploy (owner)
- [ ] Apply the three files in `supabase/pending/` to Production (AI cache isolation, roadmaps, reader sync). The study app already uses them; without the cache one, cached AI answers are readable by every student.
- [ ] Stripe and Razorpay webhooks: access is granted once and never ends; a monthly plan should lapse when renewal fails or the student cancels. Needs an owner decision on renewals.
- [x] Daily AI helps enforced on the reader (Free 5, Pro 40) — 3 Nov
- [ ] Daily helps: two simultaneous requests can both use the last help; usage-table read errors skip the daily limit
- [ ] Index `ai_usage_logs (user_id, created_at)` when usage grows
- [ ] Institute dashboard: connect to real instructor data (hidden on Production until then)
- [ ] 32 lint errors (React rules) to clean up
- [ ] Commit a lockfile that includes Linux builds
- [ ] Reader-vault wraps keys for any owner id a signed-in user names (low risk: affects only that user's own browser); redesign the legacy-migration flow
- [ ] Students can still reset their own daily usage counters; move metering server-side
- [ ] Pin the Supabase CLI version in CI
- [ ] Owner: review the Take My Study safety word list
- [ ] Owner: decide parent consent for under-18 students (DPDP) before public launch
- [ ] Live end-to-end testing on Preview with a test student account
