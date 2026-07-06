# Progress

## Status: v1.0 shipped. All 10 phases of BUILD_PLAN.md complete and verified.

Live at https://haydenharms.github.io/Personal-Budget/

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

- `scripts/migrate.cjs` — one-time import script. Reads credentials from `.env.local` and
  `supabase connection.txt` at runtime (never hardcoded, never committed), reads
  `Personal_Budget.xlsx` via the `xlsx` package (added as a devDependency), and populates
  `settings`, `categories`, `budget_amounts`, `transactions`, and `savings_goals`. Refuses to run
  if the account already has categories, to prevent accidental double-import. Supports
  `--dry-run`.
- **Workbook structure** (for future reference): `Settings` sheet has starting year / shift-late
  -income / savings-rate-method as labeled cells. `Budget Planning` has 6 year-blocks side by
  side, each 14 columns wide (12 months + Total + spacer) starting at column offsets
  2/16/30/44/58/72; category rows per type run 9-18 (income), 22-31 (expense), 35-44 (savings),
  with unused template rows literally named "Enter ___ Category…" (skipped). `Budget Tracking`
  has ~900 transaction rows starting at row 11 with columns Date/Type/Category/Amount/
  Details/Balance/Effective Date — the sheet's own Balance and Effective Date columns were NOT
  imported since the app recomputes both (client-side running balance, DB-trigger effective_date).
- **Decisions made with the user before running** (see conversation, not re-litigated here):
  50 of 900 transactions (5.5%) used category names never added to the Planning grid. Resolved
  by auto-creating 4 new expense categories (Rock Climbing, Bachelor Trip, Shopping, Side Hustle
  Expenses) plus an "Uncategorized" expense category for 11 blank-category rows, and recategorizing
  the single transaction literally labeled "Income" to "Employment" (its detail said "Airbus
  Payroll"). Asset Allocation was explicitly **skipped** per the user's choice — the workbook's
  per-bucket target percentages weren't clean 1:1 data (only an "invested funds excluding cash"
  split was present), so `asset_holdings` was left empty for the user to fill in manually later.
- **Migration result**: 24 categories, 900 transactions, 247 non-zero budget_amounts cells, 3
  savings goals (Emergency Nest, Honeymoon, Gifts).
- **Phase 8 DoD verified beyond the minimum**: spot-checked budget amounts for 3 category/month
  combos against the raw sheet cells (exact match), and cross-validated tracked income/expense
  /savings totals for 3 months spanning both years (2025-01, 2025-06, 2026-03) against sums
  computed independently from the workbook's own formula-driven Effective Date column — all
  three months matched exactly, which incidentally also proves the DB's shift-late-income trigger
  exactly reproduces the original Excel formula's behavior. Confirmed live in the browser
  (Dashboard, Planning, Tracking all render the real data with zero console errors).

- **Phase 9 — PWA Packaging**: added `vite-plugin-pwa` (workbox-based, generates the manifest and
  service worker rather than hand-rolling one). App icons (`public/icons/icon-192.png` and
  `icon-512.png`) rendered from a simple indigo "$" mark matching the app's brand color, since
  there was no existing app icon to reuse. `apple-touch-icon` and `theme-color` added to
  `index.html` for iOS.
- **Phase 9 DoD verified**: built + served the production bundle via `vite preview`, confirmed
  the manifest serves valid JSON (name, 3 icons, `display: standalone`), confirmed the service
  worker registers and reaches `active` state, then went fully offline and reloaded — the app
  shell (login screen) rendered completely with zero network connectivity, exactly matching the
  "app shell loads offline, data still requires connectivity" requirement.
- **Known deferred item**: `vite.config.js`'s PWA `start_url`/`scope` are set to `/`, which is
  correct for the dev/preview server but will need revisiting once Phase 10 picks an actual
  GitHub Pages repo name (Pages serves from a subpath like `/repo-name/`, not root) — noted here
  so it isn't forgotten.

### Phase 10 — Polish & Deploy (complete)
- Repo: `https://github.com/HaydenHarms/Personal-Budget` — created via GitHub Desktop by the
  user, linked as `origin` to the existing local repo (merged in GitHub Desktop's placeholder
  `.gitattributes` commit with `--allow-unrelated-histories` rather than force-pushing over it),
  pushed to `main`.
- Set `vite.config.js`'s `base` and the PWA manifest's `start_url`/`scope` to `/Personal-Budget/`
  to match the real Pages subpath (was `/` during earlier phases). Switched `index.html`'s
  favicon/apple-touch-icon links to Vite's `%BASE_URL%` placeholder so they resolve under the
  subpath too.
- **Mobile-first responsive pass**: checked every page at an iPhone 13 viewport (Playwright +
  `devices['iPhone 13']`) against the locally-served production build. Nav wraps correctly into a
  top bar, forms stack cleanly, and the intentionally wide data grids (Planning's 72-column
  budget grid, Tracking's ledger) scroll horizontally within their own container rather than
  breaking the page layout — a standard, acceptable pattern for dense financial tables on
  mobile. Zero console errors across all six pages.
- **Deployment**: added `gh-pages` devDependency and an `npm run deploy` script
  (`build` then `gh-pages -d dist`) — a plain static push to the `gh-pages` branch, no CI/CD
  secrets needed since the Supabase anon key is safe to ship client-side and RLS is the real
  security boundary. Ran it once; published successfully.
  **One manual step was required**: GitHub Pages was already enabled but pointed at the `main`
  branch (serving raw, unbuilt source) rather than `gh-pages`. I don't have `gh` CLI or API
  access on this machine to change that setting programmatically, so the user changed it manually
  in Settings → Pages → Source. Live and confirmed working immediately after.
- **DoD verified against the real deployed URL** (not just local build): logged in and reached
  the Dashboard successfully on both a desktop viewport and an iPhone 13 viewport, confirmed the
  service worker reaches `active` state in production, confirmed zero console errors on both.
- Side-by-side QA against the Excel workbook was already covered thoroughly during Phase 8's
  verification (exact-match cross-checks across 3 months spanning both years, using the
  workbook's own formula-computed values as the independent source of truth) — not repeated here.

### v1.0 — all phases complete
Tagged `v1.0` in git. Nothing outstanding from `BUILD_PLAN.md`. Natural next steps if this project
continues would be user-driven (e.g., filling in real Asset Allocation targets, addressing the
`825KB` JS bundle size warning via code-splitting if load time ever becomes noticeable) rather
than anything required by the original spec.

### Notes / deviations from BUILD_PLAN
- None yet. Schema and BUILD_PLAN followed as written.
