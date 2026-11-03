# ORYZEN Learn launch history

A plain-language record of each change on the way to launch: what was wrong, what changed, how it was checked, and what the owner needs to decide. Newest first. The owner decides; the engineer fixes; the observer reviews; this file records.

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
  - Also: the in-browser institute demo and the Gemini model diagnostic are hidden on Production; vault wrapping only binds data to the signed-in student; two scratch test scripts that contained a demo account password were removed.
- **Tested:** database tests on a real local Supabase (all 10 pass: the old function and the new one are refused for a student; self-upgrades are ignored; a privileged first profile is reset; usage counting still works; the server path grants access, refuses the wrong provider or student, and is safe to retry). Unit tests for the payment-mode rule and source guards.
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
- [ ] Live end-to-end testing on Preview with a test student account
