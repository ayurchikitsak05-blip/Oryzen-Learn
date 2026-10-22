# ORYZEN Learn — Owner demonstration (Phase 2D)

Local only. Soft Beige. Original logo. Deterministic study drafts if paid AI keys are empty.

## Exact URLs

- Sign in: http://localhost:3000/auth?form=1
- Learning Space: http://localhost:3000/hub
- Reader: http://localhost:3000/reader
- Notebook: http://localhost:3000/notes
- Science PDF: http://localhost:3000/demo-fixtures/science-circuit-current.pdf
- Mathematics PDF: http://localhost:3000/demo-fixtures/mathematics-triangle-pythagoras.pdf

Same PDFs on disk:

- `public/demo-fixtures/science-circuit-current.pdf`
- `public/demo-fixtures/mathematics-triangle-pythagoras.pdf`
- `tmp-e2e-artifacts/phase2d/science-circuit-current.pdf`
- `tmp-e2e-artifacts/phase2d/mathematics-triangle-pythagoras.pdf`

## Throwaway owner demo account

This is an isolated demo login, not a real student.

- Email: `oryzen.owner.demo@example.com`
- Password: `OwnerDemo-Phase2D!`

A beige banner should read **OWNER DEMO ACCOUNT**. If password sign-up is unavailable, local-only fallback is `POST /api/auth/owner-demo-local` on localhost. That cookie path is labeled **LOCAL OWNER DEMO MODE** and does not run on Production hosts.

## Step-by-step (science first)

1. Open http://localhost:3000/auth?form=1
2. Stay on **Sign In**. Enter the demo email and password. Submit.
3. You should land on http://localhost:3000/hub with the original Oryzen Learn logo.
4. Open **Read** (http://localhost:3000/reader).
5. Click **Open** and choose `science-circuit-current.pdf` (download from the URL above if needed).
6. Select the passage about circuit, current, and amperes. The study toolbar shows **Explain, Illustrate, Story, Revise, Test Me, Save** in two rows. Use **More** only for Highlight, Underline, and learning-approach.
7. Tap **Explain**. Choose the simple explanation. Confirm it stays on the circuit/current text.
8. Close the study sheet (**Back to Reading**), select the same passage, tap **Test Me**.
9. Answer all 10 questions. Miss two or three on purpose.
10. Review **incorrect answers**, **weak concepts**, and the **targeted revision** table.
11. Refresh the page. The same PDF and quiz progress should resume.
12. Optional: Open `mathematics-triangle-pythagoras.pdf` and repeat Explain + Test Me on the triangle/Pythagoras passage.

## What this demo does not need

- No paid Gemini / OpenAI / gateway keys
- No Production database change
- No live cache RLS apply
- No real student emails or class invites
- No deploy, merge, or billing

## Security limitation (say this out loud)

The live `ai_response_cache` table still has **USING (true)**. Isolation in this demo is application-level only. The pending cache RLS SQL stays unapplied.

## Approvals still needed later

- Preview deploy
- Cache RLS SQL apply
- Paid AI key
- Real student invites
