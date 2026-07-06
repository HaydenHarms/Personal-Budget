# Progress

## Status: Phase 0 and Phase 1 done and verified. Starting Phase 2 (Settings module).

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

### Next
1. Phase 2 — Settings module (bind to `settings` table, upsert on save).
2. Phase 3 — Categories & Budget Planning grid (6-year grid, balance-check row).
3. Continue phases in order per `BUILD_PLAN.md` section 7.

### Notes / deviations from BUILD_PLAN
- None yet. Schema and BUILD_PLAN followed as written.
