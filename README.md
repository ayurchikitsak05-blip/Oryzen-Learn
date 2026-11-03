# Oryzen Learn (ORYZEN Learn)

Student AI Reader and learning platform (Next.js + Supabase + Gemini).

> This repository is a **source backup**. Unfinished feature branches and backup branches may contain work-in-progress that is **not** production-ready.

## Requirements

- Node.js 20+ (Next.js 15)
- npm (lockfile: `package-lock.json`)
- Supabase project (Auth, Postgres, Storage)
- Optional: Gemini API key for AI features

## Setup

```bash
git clone https://github.com/ayurchikitsak05-blip/Oryzen-Learn.git
cd Oryzen-Learn
npm ci
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Common commands

| Command | Purpose |
|--------|---------|
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run test` | Vitest unit tests |
| `npm run lint` | ESLint |

## Database

SQL migrations live in `supabase/migrations/`. Apply with the Supabase CLI against your project (do not use Production credentials casually).

## Important branches

- `main` — default / released baseline
- `hotfix/auth-password-takeover` — authentication security hotfix + verified email password recovery (**unfinished relative to main until merged**)
- `feature/soft-beige-premium-ui` — UI + learning-mode hardening (work in progress)
- `backup/learn-local-wip-20261103` — local WIP backup (sanitized manual e2e helpers, setup docs)

## Cannot reconstruct from GitHub alone

- Live Supabase data (students, documents, notes)
- Production / Preview Vercel env values and deployment settings
- Real API keys and service-role keys
- Auth provider dashboard settings (redirect URLs, email templates)
- Local `tmp-e2e-artifacts/` and git stash binary artifacts (kept private locally)
