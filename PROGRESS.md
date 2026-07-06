# Progress

## Status: Phase 0-7 done and verified. Phase 8 (Data Migration) needs a workbook review with the
user before running, since it writes real financial data into the live account.

### Done
- Git repo initialized at project root.
- `Personal Budget.xlsx` copied from `AI Brain/budget-entry/` into the project root as
  `Personal_Budget.xlsx` (source of truth for parity testing, per BUILD_PLAN section 9).
- Vite + React scaffolded at project root (scaffolded into a temp subfolder first, then merged in,
  so the existing reference files weren't touched).
- Installed `@supabase/supabase-js`, `recharts`, `tailwindcss` + `@tailwindcss/vite`.
- Tailwind v4 wired via the Vite plugin (no separate config file needed) — see `vite.config.js`
  and `src/index.css`.
- `.env.local` created with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from
  `supabase connection.txt`. Already covered by `.gitignore`'s `*.local` pattern — never commit it.
- `src/lib/supabaseClient.js` — Supabase client from env vars.
- `src/lib/AuthContext.jsx` — session state, signIn/signUp/signOut.
- `src/pages/Login.jsx` — sign in / sign up form.
- `src/Shell.jsx` — nav shell (Planning / Tracking / Dashboard / Savings / Asset Allocation /
  Settings), all placeholder screens for now, logout button.
- `src/App.jsx` — switches between Login and Shell based on auth state.
- Removed all Vite scaffold demo content (App.css, demo assets, icons.svg).
- `npm run build` and `npm run dev` both verified working (dev server serves the app, no build
  errors).
- **Phase 0 DoD verified**: authenticated query against `categories` succeeds (no connection/RLS
  errors — table is just empty for this user, see note below).
- **Phase 1 DoD verified**: sign-in with corrected credentials succeeds end-to-end.
  `supabase connection.txt` updated with the working password (not committed to git).

### Note on empty data
Authenticated queries against `categories`, `settings`, and `transactions` all return 0 rows for
the current user, despite BUILD_PLAN.md section 3 claiming a `settings` row was already seeded.
Likely the auth user was recreated at some point (new UUID), orphaning any previously-seeded data
under an old user ID. Not currently blocking anything: Phase 2 upserts a `settings` row on first
save, and Phase 8 (Data Migration) populates categories/budget/transactions from
`Personal_Budget.xlsx` under the current user ID regardless. See `BLOCKERS.md` for detail.

- `src/pages/Settings.jsx` — bound to the `settings` table (starting year, shift-late-income
  toggle + day, savings rate method), upserts on save. Wired into `Shell.jsx`.
- **Phase 2 DoD verified**: upsert + reload round-trip tested directly against Supabase (set
  test values, reloaded, confirmed match), then reset the row back to schema defaults
  (starting_year = current year, shift active, day 25, method active) so no test data was left
  in the real account.

- `src/pages/Planning.jsx` — category CRUD (add/rename/reorder/delete) grouped by
  income/expense/savings, plus the 6-year × 12-month budget grid bound to `budget_amounts`
  (upsert per cell on blur), with a live "To be allocated" row per month and a ✓ when
  Income − Expenses − Savings == 0. Wired into `Shell.jsx`.
- **Phase 3 DoD verified end-to-end in a real headless-Chromium session** (installed Playwright
  in scratchpad since `chromium-cli` wasn't available on this machine): logged in, added an
  income category and an expense category, entered matching amounts, confirmed the "To be
  allocated" row went from an unbalanced number to a ✓, confirmed the amounts persisted after a
  full page reload, then deleted both test categories to leave the real account clean. Zero
  console errors during the run.

- `src/pages/Tracking.jsx` — transaction ledger: form (date/type/category/amount/details) with
  the category dropdown cascading off the selected type, table sorted by date ascending with a
  running balance column (income adds, expense/savings subtract), edit/delete per row, displays
  `effective_date` straight from the DB (never recomputed client-side). Wired into `Shell.jsx`.
- **Phase 4 DoD verified end-to-end in headless Chromium**: cascading dropdown confirmed
  (income/expense option lists don't cross-contaminate), added transactions on the 1st, 5th, and
  27th of a month — confirmed the 27th (>= `shift_late_income_day` 25) correctly showed
  `effective_date` shifted to the 1st of the next month via the DB trigger, running balance
  computed correctly across income/expense, edit and delete both verified, zero console errors.
  Test categories and transactions cleaned up afterward.

- `src/pages/Dashboard.jsx` — Year selector (Current Year / specific year from the 6-year range) +
  Period selector (Total Year / Current Month / specific month), breakdown table (Tracked,
  Budget, % Complete, Remaining, Excess per category, sorted by tracked descending regardless of
  type per BUILD_PLAN section 5), doughnut charts (top-5 + Other) for Income/Expenses/Savings,
  KPI tiles (period balance, savings rate per settings method, % of period elapsed, days since
  last transaction). All aggregation keys off `effective_date`, never the raw transaction `date`.
- **Decision**: the bar chart ("tracked vs. budget by month" per BUILD_PLAN section 7) shows
  **Expenses only** — the spec didn't say which type, and expense-vs-budget is the standard
  budget-adherence chart. Selected month is highlighted at full opacity, other months dimmed to
  0.35 opacity; no dimming when the period is "Total Year". Documented here since it's a judgment
  call, not a literal spec requirement.
- **Phase 5 DoD verified end-to-end in headless Chromium**: seeded one category of each type with
  a current-month budget and a matching transaction, confirmed the breakdown table sorted by
  tracked descending (3000 > 1000 > 500) with correct %/remaining/excess math, confirmed KPI tiles
  computed correctly (period balance 1500 = 3000 − 1000 − 500, savings rate 16.7% = 500/3000),
  switched the period selector to an empty month and confirmed every chart, tile, and table row
  recomputed to zero/appropriate values, confirmed 9 chart `<svg>` elements rendered, zero console
  errors. Cleaned up test data afterward.
- **Test-harness note (not a product bug)**: automated rapid-fire category additions (three
  `<select>`-driven submits back-to-back with zero delay) intermittently submitted the previous
  render's stale type value. Confirmed via network inspection that adding a 500ms pause between
  submissions eliminates it completely — not reproducible at anything resembling human typing
  speed. No app code changed; noting it here in case future automated tests hit the same thing.

- `src/pages/Savings.jsx` — CRUD for `savings_goals` (name, goal amount, current amount),
  per-goal progress bar, total saved / total goal / left-to-allocate summary tiles.
- **Phase 6 DoD verified in headless Chromium**: added a goal (5000 goal / 1000 current → 20%
  progress bar, tiles matched), edited current amount to 2500 → bar and tiles recomputed to 50%
  live, deleted the goal and confirmed tiles reset to zero. Zero console errors.
- `src/pages/AssetAllocation.jsx` — CRUD for `asset_holdings` (bucket, target %, current value),
  current-vs-target diff column, pie chart of current allocation.
- **Phase 7 DoD verified in headless Chromium**: added US (60%/6000) and Cash (40%/4000) holdings,
  confirmed current % and diff computed correctly (0% diff when matching target), edited US to
  7000 and confirmed both rows recomputed correctly (US 63.6%/+3.6%, Cash 36.4%/-3.6%), pie chart
  rendered, cleanup verified. Zero console errors.

### Next
1. Phase 8 — Data Migration. **Needs a workbook review with the user first**: open
   `Personal_Budget.xlsx` together to confirm sheet/column layout before writing real transaction
   history, budget amounts, and holdings into the live Supabase account. This is the first phase
   that touches real user financial data rather than throwaway test rows, so it warrants a
   check-in rather than assuming the layout.
2. Continue phases in order per `BUILD_PLAN.md` section 7.

### Notes / deviations from BUILD_PLAN
- None yet. Schema and BUILD_PLAN followed as written.
