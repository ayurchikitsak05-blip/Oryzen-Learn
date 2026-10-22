# ORYZEN Learn — Owner demonstration (Phase 2E)

Local only. Soft Beige. Original logo. Deterministic study drafts if paid AI keys are empty. GEMINI is not claimed to work.

## Exact URLs

- Sign in: http://localhost:3000/auth?form=1
- Learning Space: http://localhost:3000/hub
- Reader: http://localhost:3000/reader
- Notebook: http://localhost:3000/notes
- Science PDF: http://localhost:3000/demo-fixtures/science-circuit-current.pdf
- Rectangle PDF: http://localhost:3000/demo-fixtures/mathematics-rectangle-area.pdf
- Longer chapter PDF: http://localhost:3000/demo-fixtures/science-work-energy-chapter.pdf
- Triangle PDF (optional): http://localhost:3000/demo-fixtures/mathematics-triangle-pythagoras.pdf

Same PDFs on disk:

- `public/demo-fixtures/science-circuit-current.pdf`
- `public/demo-fixtures/mathematics-rectangle-area.pdf`
- `public/demo-fixtures/science-work-energy-chapter.pdf`
- `public/demo-fixtures/mathematics-triangle-pythagoras.pdf`
- `tmp-e2e-artifacts/phase2e/science-work-energy-chapter.pdf`
- `tmp-e2e-artifacts/phase2e/mathematics-rectangle-area.pdf`

## Throwaway owner demo account

This is an isolated demo login, not a real student.

- Email: `oryzen.owner.demo@example.com`
- Password: `OwnerDemo-Phase2D!`

A beige banner should read **OWNER DEMO ACCOUNT**. If password sign-up is unavailable, local-only fallback is `POST /api/auth/owner-demo-local` on localhost. That cookie path is labeled **LOCAL OWNER DEMO MODE** and does not run on Production hosts.

## Step-by-step

1. Reuse the existing local server on http://localhost:3000 (do not start a second one if `:3000` is already taken).
2. Open http://localhost:3000/auth?form=1
3. Stay on **Sign In**. Enter the demo email and password. Submit.
4. You should land on http://localhost:3000/hub with the original Oryzen Learn logo.
5. Open **Read** (http://localhost:3000/reader). The page should fill most of the pane (Fit Width is the default).
6. Click **Open** and choose `science-circuit-current.pdf`, or pick **Area of a Rectangle** / **Work and Energy — Sample Chapter** from the document list.
7. Select a passage. A compact toolbar should sit near the selection (not a large card covering the page) with **Explain, Illustrate, Story, Revise, Test Me, Save, Highlight, Underline**.
8. Tap **Explain**. Switch Simple / Standard / Deeper. The three bodies should not repeat the same sentences.
9. On the rectangle passage, tap **Illustrate**. The flowchart/concept view should show a labelled rectangle **L = 8 cm**, **W = 5 cm**, **Area = 40 cm²**.
10. Tap **Story**. The scene should teach the idea (tiles, torch, puck) instead of quoting the paragraph.
11. Tap **Test Me**, answer the questions, then refresh. The same book, page, marks, notes, and quiz progress should resume.

## What this demo does not need

- No paid Gemini / OpenAI / gateway keys
- No Production database change
- No live cache RLS apply
- No real student emails or class invites
- No deploy, merge, or billing

## What still uses the deterministic fallback

When `GEMINI_API_KEY` / paid provider keys are empty, every study lens (**Explain, Illustrate, Story, Revise, Test Me, Save**, learning approach) is composed locally by `composeDeterministicLensPayload`. The study drawer may show “No AI provider is configured. Showing a source-grounded study draft.”

## Security limitation (say this out loud)

The live `ai_response_cache` table still has **USING (true)**. Isolation in this demo is application-level and local-storage scoped by user id. The pending cache RLS SQL stays unapplied.

## Approvals still needed later

- Preview deploy
- Cache RLS SQL apply
- Paid AI key
- Real student invites
