# ORYZEN Learn launch history

A plain-language record of each change on the way to launch: what was wrong, what changed, how it was checked, and what the owner needs to decide. Newest first. The owner decides; the engineer fixes; the observer reviews; this file records.

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
- [ ] Free plan gets the same features as Pro; plan quotas aren't enforced on AI calls (only the ₹70 monthly AI wallet per student)
- [ ] Institute dashboard: connect to real instructor data (hidden on Production until then)
- [ ] 32 lint errors (React rules) to clean up
- [ ] Commit a lockfile that includes Linux builds
- [ ] Reader-vault wraps keys for any owner id a signed-in user names (low risk: affects only that user's own browser); redesign the legacy-migration flow
- [ ] Students can still reset their own daily usage counters; move metering server-side
- [ ] Pin the Supabase CLI version in CI
- [ ] Owner: review the Take My Study safety word list
- [ ] Live end-to-end testing on Preview with a test student account
