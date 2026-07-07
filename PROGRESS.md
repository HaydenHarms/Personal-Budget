# Progress

## Status: v1.0 shipped. BUILD_PLAN.md (10 phases), BUDGET_FIXES.md (4 steps), and
DASHBOARD_FIX_SPEC.md (9 issues) all complete (see bottom of this file for the latter two). Only
outstanding item: BUDGET_FIXES Step 1's CSV import script hasn't been run for real yet - no
actual bank export exists to feed it.

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

---

## BUDGET_FIXES.md — post-launch fix spec

`BUDGET_FIXES.md` was found in the GitHub Desktop clone at
`C:\Users\harms\Documents\GitHub\Personal Budget` (a second local clone of the same repo, one
commit behind this working copy) and copied here. That clone folder still exists — it's a plain
clone with no extra remotes, only relevant if the user edits files there directly again.

### Step 1 — CSV → Supabase transaction import script (done)
- `scripts/import-csv.js` (ESM, matches this project's `"type": "module"`). Reads Supabase
  credentials the same way `scripts/migrate.cjs` does (`.env.local` + `supabase connection.txt`,
  never hardcoded/committed). Added `dotenv` and `csv-parse` as devDependencies.
- Implements every filter in order: Posted-only, transfer-description skip, credit/refund vs.
  income-credit distinction, then dedup against existing Supabase rows for the CSV's date range
  (`date|amount|details` key). Merchant-name cleaning strips the noise patterns listed in the
  spec. Archives the source file to `AccountHistory(n+1).csv` on a real (non-dry-run) run.
- **Spec gap found and resolved**: the category-mapping table only covers expense merchants —
  there was no rule for income credits (e.g. "...Payroll"). Mapped all income-type rows to the
  `Employment` category (it already exists from the Phase 8 migration and is the obvious fit)
  rather than letting them fall through to "Miscellaneous", which is what happened before the fix
  and would have been a confusing default for a paycheck.
- Added a `--dry-run` flag (not in the original spec, same pattern as `scripts/migrate.cjs`) —
  there's no real bank CSV yet, so this was the only way to verify the logic without writing
  fabricated test transactions into the real account. In dry-run mode it now prints exactly what
  it would import (date/type/amount/category/details), not just counts.
- **Verified** with a constructed test CSV covering every branch: a clean expense merchant match
  (Food), an income/Payroll row (now correctly → Employment), a noisy description needing
  cleanup (leading ref number + "POS PURCHASE" + trailing "Dallas TX" all stripped correctly), a
  Pending row (skipped), a Zelle transfer (skipped), a merchant refund credit (skipped, not
  income), an unmatched merchant (→ Miscellaneous + flagged for review), and one deliberately
  duplicated real transaction (`2026-07-03, Target, $38.50` — confirmed via a live read-only
  query first) which was correctly skipped as a duplicate. A second row also turned out to match
  an existing real transaction by coincidence, confirming dedup catches unplanned collisions too.
  Counts and per-row output all matched expectations; zero rows written to the real account.
- **Not yet run for real** — waiting on an actual bank CSV export from the user.

### Step 2 — Collapsible years on Planning tab (done)
- `src/pages/Planning.jsx`: added `collapsedYears` state (a `Set` of year numbers) and a
  `yearTotals` memo (annual income/expense/savings/remaining/balanced, derived by summing the
  existing per-month `monthTotals` across all 12 months of that year — no new data fetch).
  Clicking a year header toggles it; collapsed years render one "Total" column (chevron `›`)
  instead of 12 month columns (chevron `ˇ`), showing each category's annual sum
  (`getCategoryYearTotal`) and the annual balanced-check on the "To be allocated" row. All
  `colSpan`s (year header, type-section header) now compute dynamically off collapsed state
  instead of the old hardcoded `12`/`1 + years.length * 12`.
- **Verified in the running dev app against real data**: collapsed 2025, confirmed the chevron
  flipped, confirmed Employment's month-input count dropped by exactly 12 (72 → 60, i.e. exactly
  one year's worth), confirmed the displayed annual total (11,440) exactly matches the original
  Excel workbook's own "Total" column for that category/year, re-expanded and confirmed the Jan
  value was unchanged (150 before and after — proving no refetch or data loss), zero console
  errors. Other years remained independently expanded throughout.

### Step 3 — Bar chart fix: tracked vs. budget overlay (done)
- `src/pages/Dashboard.jsx`: replaced the old 4-series chart (Income/Expenses/Savings tracked +
  a separate standalone "Budget" bar) with 3 outline/filled pairs — one per type — using
  Recharts' `barGap={-14}` to make each pair overlap at the same x-position rather than sit
  side by side (the spec's sample code didn't specify how to achieve the overlap; grouped bars
  in Recharts sit side-by-side by default, so this was the piece that needed figuring out).
  Budget renders as a `fill="transparent"` bar with a colored stroke (wider, `barSize={18}`);
  tracked renders as a filled bar of the same color (narrower, `barSize={12}`), so the budget
  outline peeks out around the tracked bar. Replaced Recharts' auto-generated 6-entry `<Legend>`
  (which would've shown `budget_income`, `income`, etc.) with a small custom legend: one
  outline/filled swatch pair labeled "Budget"/"Tracked", plus one color swatch per type.
  `monthlyExpenseChart` (expense-only) was replaced by `monthlyChart`, which now aggregates
  tracked and budget for all three types per month.
- **Verified in the running dev app against real data**: confirmed all 3 series render as
  correctly-colored overlapping outline+filled pairs per month, confirmed switching the period
  selector to a specific month (March) dims every other month's bars while March stays fully
  opaque, confirmed "Total Year" shows all months at full opacity with no dimming, zero console
  errors.

### Step 4 — Sankey diagram (done)
- Installed `d3-sankey`. New `src/components/SankeyChart.jsx` (props: `data`, `width`, `height`)
  computes node/link layout via `d3-sankey` and renders plain SVG — income category nodes on the
  left (green), a single "Income" hub node in the middle, expense/savings category nodes on the
  right (red/blue), with income labels right-aligned-to-the-left-of-node and expense/savings
  labels left-aligned-to-the-right-of-node, avoiding overlap with the flows. Clicking a node
  toggles `selectedNodeId`; links and nodes not touching the selected node dim to low opacity.
  Renders a "No data for this period." message when there are no income or outflow categories
  with tracked amounts.
- **Bug found and fixed during testing**: initially crashed the entire React tree on first render
  (blank white page, no error boundary to catch it) because the layout config called
  `.nodeId((d) => d.id)` while the link `source`/`target` had already been pre-resolved to numeric
  array indices in this component's own preprocessing step — that combination tells d3-sankey to
  match indices against string ids, which never matches and throws inside the layout call.
  Removed the redundant `.nodeId()` call since the indices are already correct without it.
- `src/pages/Dashboard.jsx`: added a `sankeyData` memo built directly from the existing
  `breakdown` array (income categories → hub → expense/savings categories, using `tracked`
  amounts), and a collapsed-by-default "Money Flow" accordion section between the doughnut
  charts and the bar chart, matching the spec's "so it doesn't crowd the existing summary."
- **Verified in the running dev app against real data**: confirmed the accordion starts
  collapsed, expanding renders 22 correctly-colored node rects with proportional flow widths,
  clicking a leaf node produced exactly one link at `stroke-opacity: 0.35` while all 18 others
  dropped to `0.08` (confirmed by reading the actual SVG attribute values, not just eyeballing
  it), switching the year selector to 2029 (no data) correctly showed the empty-state message
  instead of an empty/broken chart, zero console errors throughout.

---

## DASHBOARD_FIX_SPEC.md — bar chart & Sankey polish

Found in the same GitHub Desktop clone folder as `BUDGET_FIXES.md`, copied here the same way.

### Issue 4 — flat-bar months investigated (not a bug)
Queried `budget_amounts` and `transactions` directly against the live account for 2026:
- **Budget data is present for every month** (11-12 non-zero rows/month, ~$3,300-6,900 total
  budgeted per month all year) — the Planning grid data made it into the database correctly.
  Rows aren't 1-per-category-per-month because the migration script (and the Planning UI) only
  ever writes non-zero cells; that's expected sparsity matching the source Excel, not missing data.
- **Aug-Dec 2026 genuinely have zero transactions** — confirmed the most recent transaction in the
  account is dated 2026-07-03. Those months are in the future relative to today; nothing has been
  logged yet. This is the second scenario the spec called out explicitly ("if live tracking has
  only been happening for a few months... flat bars for future months would be correct, not a
  bug") — confirmed that's exactly what's happening, not a query bug.
- Also re-read `monthlyChart`'s aggregation code (`src/pages/Dashboard.jsx`): it correctly uses
  the full-year `txns`/`budgetRows` (not the period-filtered subset), grouped by `effective_date`
  month with no filtering logic that would incorrectly hide populated months. No code bug found.
- **Separate observation, not a bug**: some middle months (Mar/Apr) have real non-zero
  expense/savings values but can *look* visually flat in a screenshot because Income spikes
  (e.g. Feb ~$7,700) dominate the shared linear Y-axis, compressing smaller-magnitude
  expense/savings bars toward the bottom. This is an inherent tradeoff of overlaying three series
  with very different typical magnitudes on one axis, not something the spec asked to be
  redesigned (e.g. dual-axis or log scale) — noting it here for awareness, no change made.
- **Conclusion**: proceeding with Issues 1-3 styling fixes as directed, since the underlying data
  is correct and the chart's remaining problems are genuinely styling/UX (tooltip, highlight,
  legend), not data.

### Issues 1-3 — bar chart polish (done)
- **Issue 1 (tooltip)**: replaced the default Recharts tooltip with a custom `MonthlyChartTooltip`
  component. Root cause of the "only shows tracked, not budget" symptom: rather than debug
  Recharts' payload-filtering behavior with 6 overlapping Bar series (some `fill="transparent"`),
  the new tooltip looks up the hovered month directly from `monthlyChart` by label instead of
  trusting Recharts' payload — guaranteed to always show all three series' tracked *and* budget
  values, styled dark (`bg-gray-900`), compact, per-series color-coded, currency-formatted.
- **Issue 2 (harsh gray highlight box)**: this was never the per-bar Cell-opacity dimming I'd
  built for the selected period (that part was already working correctly) — it was Recharts'
  *default hover cursor*, an unstyled solid-gray rectangle shown on every hover regardless of
  period selection. Fixed by setting `cursor={{ fill: '#6366f1', fillOpacity: 0.08 }}` on the
  `<Tooltip>`, a subtle on-theme indigo wash sized to just the hovered month's column (Recharts'
  default sizing was already correct — only the color/opacity was harsh).
- **Issue 3 (legend)**: added a vertical divider between the style-legend (Budget outline /
  Tracked filled swatches) and the color-legend (Income/Expenses/Savings), plus clarified labels
  ("Budget (outline)" / "Tracked (filled)") so the two-dimensional encoding reads as two visually
  distinct groups instead of five unrelated flat items.
- **Verified against the running dev app with real data**: hovering a bar now shows a compact
  dark tooltip with all 3 series' tracked/budget pairs (confirmed via `innerText`, e.g.
  `"Apr / Income $1849.59 / $1612.00 / Expenses $1284.73 / $1065.00 / Savings $1102.32 / $696.50"`),
  the hover cursor is a subtle indigo wash instead of solid gray, and the legend now visually
  groups into two sections. Zero console errors.

### Issues 5-9 — Sankey diagram polish (done)
- **Issue 5 (clipped title)**: added `TOP_MARGIN = 24` to the sankey layout's `extent()` (was 5px)
  so the "Income" hub label has room to render above the node instead of touching the SVG edge.
- **Issue 6 (no labels)**: the labels were actually already in the DOM the whole time (confirmed
  via `textContent` — right label-detection approach, since SVG `<text>` has no `.innerText`) —
  they were rendering **off-canvas**. The layout's `extent()` placed nodes flush against x=1 and
  x=width-1 with zero horizontal margin, so left-side labels (positioned via `x0 - 6`, right-
  aligned) landed at negative x, and right-side labels (`x1 + 6`) landed past the SVG's right
  edge. Fixed by adding `SIDE_MARGIN = 150` px on both sides of the layout extent. Also added
  ellipsis truncation (`MAX_LABEL_CHARS = 20`) for names too long to fit even with the added
  margin (e.g. "Bond Coupons / Savings Interest" → "Bond Coupons / Savi…"), with the full name
  still available via a native `<title>` on the text element and the existing hover tooltip.
- **Issue 7 (colors)**: added a `categoryColorMap` memo in `Dashboard.jsx` using the exact same
  top-5-per-type + "Other" gray assignment as the doughnut charts (`SLICE_COLORS`/`OTHER_COLOR`),
  passed down as `node.color` / `link.color`. `SankeyChart.jsx` now fills nodes and strokes links
  with the specific per-category color instead of the previous broad income/expense/savings
  type-only palette, so a category's color is now consistent across doughnuts and Sankey alike.
- **Issue 8 (no tooltips)**: added hover state tracking mouse position on both node `<rect>`s and
  link `<path>`s, rendering a floating dark-styled tooltip (same visual language as Issue 1's bar
  chart tooltip) showing the category/flow name and dollar value.
- **Issue 9 (selector reactivity)**: confirmed already correct — `sankeyData` derives from
  `breakdown`, which is already Year/Period-scoped. Verified explicitly: Employment's node value
  read $12,160.83 for the full year, $2,712.76 for January only, and switching to 2025/January
  correctly re-sorted "Coca Cola Dividends" ($400) ahead of Employment ($150) since it was
  genuinely the larger income category that specific month — proving both the value and the
  sort order recompute correctly, not just a visual difference.
- **Verified against the running dev app with real data**: zoomed screenshots confirm the "Income"
  title is fully visible, all 19 category labels render legibly (with truncation working for the
  one overly-long name), colors are vivid and per-category distinct, and both node and link hover
  tooltips return correct content (e.g. link hover → `"Employment → Income\n\n$12160.83"`). Zero
  console errors throughout.
