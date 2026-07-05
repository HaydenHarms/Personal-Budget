# Progress

## Status: Phase 0 done (connection verified anonymously); Phase 1 built, blocked on login credentials

See `BLOCKERS.md` for the one open item.

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
- Anonymous REST query against `categories` confirmed the Supabase URL + anon key are valid
  (HTTP 200).

### Blocked
- Could not complete authenticated verification (Phase 0 DoD "successfully queries the categories
  table" in the sense of a real logged-in session, and Phase 1 DoD "can log in") because the
  password in `supabase connection.txt` doesn't match the existing account. See `BLOCKERS.md`.

### Next (once unblocked)
1. Re-verify login with corrected credentials; confirm Shell renders, nav switches, logout works.
2. Phase 2 — Settings module (bind to `settings` table, upsert on save).
3. Phase 3 — Categories & Budget Planning grid (6-year grid, balance-check row).
4. Continue phases in order per `BUILD_PLAN.md` section 7.

### Notes / deviations from BUILD_PLAN
- None yet. Schema and BUILD_PLAN followed as written.
