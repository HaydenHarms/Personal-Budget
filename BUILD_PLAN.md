# Personal Budget App — Build Plan (v1.0)

**Purpose of this document:** a complete, unambiguous build spec for Claude Code to execute autonomously, start to finish, across as many sessions as needed. Every open decision from planning conversations has been resolved below so no human input should be required mid-build except providing credentials.

---

## 1. Project Overview

Replace `Personal_Budget.xlsx` with a web app that preserves 100% of its functional behavior while adding cross-device sync (phone + desktop). This is a single-user personal finance tool — no multi-tenant concerns beyond standard auth.

**Source of truth for behavior:** `Personal_Budget.xlsx` (reference for parity testing). Do not guess at behavior — if uncertain how the original worked, check the workbook.

**Source of truth for data shape:** `budget_schema.sql` (already deployed to Supabase — do not alter without updating this document).

---

## 2. Tech Stack (Decided — do not re-litigate)

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React + Vite | Matches patterns already used in other active projects |
| Styling | Tailwind CSS | Fast, consistent, avoids bikeshedding on CSS architecture |
| Charts | Recharts | Covers doughnut, bar, pie needs natively |
| Backend | Supabase (Postgres + Auth + RLS) | Already provisioned and schema deployed |
| Data access | `@supabase/supabase-js` client, called directly from frontend | No custom backend needed — RLS is the security boundary |
| Packaging | PWA (manifest + service worker) | Works on phone (Add to Home Screen) and desktop from one codebase |
| Hosting (v1.0) | GitHub Pages | Free, static, no server secrets required for this feature set |
| Hosting (revisit only if) | Vercel | Only needed if a future feature requires server-side secrets (e.g., Stripe) — not needed for v1.0 |

---

## 3. Already Complete (do not redo)

- [x] Supabase project created
- [x] Schema deployed: `categories`, `budget_amounts`, `settings`, `transactions`, `savings_goals`, `asset_holdings`
- [x] RLS enabled + owner-only policies on all tables
- [x] `effective_date` trigger implementing shift-late-income logic
- [x] One `settings` row seeded for the primary user

## 4. Immediate Blocker (resolve first, before Phase 0)

`supabase_test.html` fails with "Failed to fetch" — almost certainly caused by opening the file via `file://` instead of serving it over `http://`. Fix: serve via `python3 -m http.server 8000` and retest at `http://localhost:8000/supabase_test.html`. If it still fails, check the browser console for the real underlying error (CORS, DNS, malformed URL) and resolve before proceeding. **Do not proceed to Phase 0 until this test passes.**

---

## 5. Non-Negotiable Business Logic (must match the Excel workbook exactly)

- **Shift late income:** an income transaction dated on/after `settings.shift_late_income_day` gets `effective_date` = the 1st of the following month. Already implemented as a DB trigger — the frontend just needs to trust and display `effective_date`, never recompute it client-side.
- **Savings rate:**
  - `active` method = Savings ÷ Income
  - `passive` method = (Income − Expenses) ÷ Income
- **Zero-based "balanced" check:** a month is balanced when `Income − Expenses − Savings == 0` for that month, across all categories.
- **Categories are the single source of truth.** The Tracking category dropdown and every Dashboard row must derive from the `categories` table live — never hardcode category names anywhere in the frontend.
- **Dashboard breakdown sort order:** categories sort by tracked amount descending, not alphabetically or by budget.

---

## 6. Design Guidelines (carried over from the Excel version)

- Clean, app-like content areas — don't cram content edge-to-edge on desktop.
- Large, bold section headers per screen (Planning / Tracking / Dashboard / etc.).
- Checkmark-style status indicators for "balanced" months, matching the Excel ✓ pattern.
- Doughnut charts for category distribution (top 5 + "Other"), bar charts for month-over-month tracked-vs-budget, with the selected period visually "in focus" vs. dimmed for other periods.
- Mobile-first responsive design — phone usage is a primary use case, not an afterthought.

---

## 7. Build Phases

Work through these **in order**. Each phase has a Definition of Done (DoD) — do not move to the next phase until the current one's DoD is met and verified (build runs, no console errors, manual spot-check against the Excel workbook where relevant).

### Phase 0 — Environment Setup
- Scaffold Vite + React project
- Install `@supabase/supabase-js`, Tailwind, Recharts
- Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Add `.env.local` to `.gitignore` — **never commit credentials**
- DoD: `npm run dev` runs a blank app that successfully queries the `categories` table (empty result is fine — the point is the connection works)

### Phase 1 — Auth & App Shell
- Login/signup screen using `supabase.auth.signInWithPassword` / `signUp`
- Persist session across reloads
- App shell with navigation: Planning / Tracking / Dashboard / Savings / Asset Allocation / Settings
- DoD: can log in, see the shell, navigate between empty screens, log out

### Phase 2 — Settings Module
- Screen bound to the `settings` table: starting year, shift-late-income toggle + day, savings rate method toggle
- Upsert on save (one row per user)
- DoD: changing and saving settings persists and reloads correctly

### Phase 3 — Categories & Budget Planning Grid
- CRUD UI for categories (type: income/expense/savings, name, sort order)
- 6-year grid: rows = categories grouped by type, columns = months × years (`starting_year` through `starting_year + 5`)
- Per-month "To be allocated" row = Income − Expenses − Savings, with a checkmark when balanced (see Section 5)
- Persist to `budget_amounts` (upsert per category/year/month)
- DoD: add a category, enter monthly amounts, see per-month totals and balance-check update live

### Phase 4 — Transaction Tracking Ledger
- Form + table: date, type, category (dropdown filtered by type — cascading), amount, details
- Display `effective_date` from the DB (already computed by trigger — do not recompute client-side)
- Running balance column
- DoD: add/edit/delete transactions; list sorts by date; balance and effective date are correct; category dropdown correctly filters by selected type

### Phase 5 — Dashboard
- Year selector (Current Year / specific year) + Period selector (Total Year / Current Month / specific month)
- Breakdown table: Tracked, Budget, % Complete, Remaining, Excess per category — sorted by tracked amount descending
- Doughnut charts: top-5 categories + "Other" for each of Income/Expenses/Savings
- Bar chart: tracked vs. budget by month, selected period visually highlighted
- KPI tiles: period balance, savings rate (per settings method), % of period elapsed, days since last transaction
- DoD: changing either selector correctly recomputes every chart and the breakdown table, aggregating on `effective_date`

### Phase 6 — Savings Goal Envelopes
- CRUD for `savings_goals`: name, goal amount, current amount
- Progress-bar visualization per goal
- Total saved + "left to allocate" indicator
- DoD: adding/editing a goal updates its progress bar and the totals correctly

### Phase 7 — Asset Allocation Module
- CRUD for `asset_holdings`: bucket (US/World/Cash/Crypto), target %, current value
- Diff-from-target calculation
- Pie or bar chart of current vs. target
- DoD: allocation view correctly shows current vs. target and the delta

### Phase 8 — Data Migration
- Write a one-time import script (Node or Python) that reads `Personal_Budget.xlsx` and populates: categories, all 6 years of planning amounts, the full transaction history (~900 rows), savings accounts, and asset holdings
- DoD: after import, the Dashboard's numbers match the Excel workbook for at least 3 spot-checked months

### Phase 9 — PWA Packaging
- `manifest.json`, service worker, app icons
- Installable via "Add to Home Screen" on phone and as a desktop PWA
- DoD: app installs on both a phone browser and a desktop browser; app shell loads offline (data still requires connectivity)

### Phase 10 — Polish & Deploy
- Full responsive pass, mobile-first
- Deploy static build to GitHub Pages
- Side-by-side QA against the Excel workbook for one full real month of usage
- DoD: v1.0 tagged in git, live URL working correctly on both phone and desktop

---

## 8. Session Continuity Instructions (for Claude Code specifically)

Because this build is meant to run non-stop across potentially many sessions:

1. Maintain a `PROGRESS.md` file at the project root. After completing any phase or meaningful subtask, update it with what's done and what's next.
2. At the **start of every session**, read `PROGRESS.md` and `BLOCKERS.md` (if it exists) before taking any action.
3. If genuinely blocked (missing credential, ambiguous requirement not covered above), write the blocker to `BLOCKERS.md` with enough detail for a human to resolve it, then move to the next non-dependent task rather than halting entirely.
4. Commit frequently with descriptive messages — after each completed phase at minimum, ideally after each meaningful subtask — so progress is always recoverable.
5. Never commit `.env` files, API keys, or the `service_role`/secret Supabase key anywhere in the repo.
6. Treat `budget_schema.sql` and this document as the specification. If a change to either seems necessary, note why in `PROGRESS.md` rather than silently deviating.

---

## 9. Reference Files

- `budget_schema.sql` — deployed database schema, source of truth for data shape
- `supabase_test.html` — connection/auth/RLS smoke test utility
- `Personal_Budget.xlsx` — source of truth for feature parity and QA

---

## 10. Explicitly Out of Scope for v1.0

- Multi-user support of any kind
- Stripe or any payment integration
- Server-side rendering or a custom backend beyond Supabase
- Native mobile app (PWA covers the phone use case for v1.0)
