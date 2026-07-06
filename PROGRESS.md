# Progress

## Status: Phase 0-4 done and verified. Starting Phase 5 (Dashboard).

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

### Next
1. Phase 5 — Dashboard (year/period selectors, breakdown table, doughnut + bar charts, KPI tiles).
2. Continue phases in order per `BUILD_PLAN.md` section 7.

### Notes / deviations from BUILD_PLAN
- None yet. Schema and BUILD_PLAN followed as written.
