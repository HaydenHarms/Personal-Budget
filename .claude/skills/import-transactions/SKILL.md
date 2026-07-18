---
name: import-transactions
description: Import a bank CSV export into this budget app's Supabase `transactions` table. Scopes the CSV to a date range, verifies every candidate row against existing DB rows (exact-match AND fuzzy same-date/same-amount match, since bank CSV descriptions get truncated/garbled and won't text-match a manually-cleaned DB entry), lets the user fix mis-categorized rows, and only then inserts. Use whenever the user wants to add transactions from a bank CSV, catch up the Tracking ledger, or reconcile recent account activity.
---

# Import Transactions (bank CSV → Supabase)

This encodes a workflow developed interactively on 2026-07-17 for the personal budget
app. The core lesson: **never trust exact-string dedup alone.** Bank CSV exports
truncate/garble merchant descriptions ("Village Bur", "Riverlakesra", "Top Golf Bay
Res"), while transactions already in the DB are often entered with clean names
("Village Burger", "River Lakes Ranch", "Topgolf Bay Reservation"). A same-date/
same-amount row with different text is almost always the *same* transaction, not a
new one — and the existing `scripts/import-csv.js` dedup key (`date|amount|details`)
will miss it and double-insert. This skill's comparison step catches that before
anything is written.

## Prerequisites

- `.env.local` at repo root has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `supabase connection.txt` at repo root has `email:` / `password:` lines for a
  Supabase auth user (the scripts sign in with this to get a `user_id` for RLS).
- Schema reference: `budget_schema.sql` — `transactions` table has `date`, `type`
  (`income`/`expense`/`savings`), `category_id`, `amount`, `details`. `effective_date`
  and `user_id` are set by DB trigger/default — never set them from the client.
- Scripts used (all in `scripts/`, all read `.env.local` / `supabase connection.txt`
  themselves — never hardcode or print credentials):
  - `filter-csv-by-date.mjs` — scope a CSV to a date window without touching the
    original file.
  - `compare-transactions.mjs` — **read-only**. Compares CSV candidates against
    Supabase and buckets them into exact duplicate / fuzzy duplicate / genuinely new.
  - `import-csv.js` — the original full pipeline (categorize + insert + archive
    source file). Still useful for its dry-run categorization logic and for actually
    running a full uncontested import, but do NOT run it non-dry-run directly on a
    large/ambiguous file — see workflow below.
  - `insert-reviewed-transactions.mjs` — inserts a hand-reviewed JSON array (produced
    by this workflow) after category corrections.

## Workflow

1. **Locate the CSV.** Ask the user for the file path if not given. Read the first
   few lines (`Read` tool) to confirm columns match the expected bank export shape:
   `Account Number, Post Date, Check, Description, Debit, Credit, Status,
   Classification`. If the shape is different, stop and ask — the parsing logic in
   `import-csv.js` / `compare-transactions.mjs` is written for this exact format.

2. **Check the file's actual scope before assuming "recent".** A file named like a
   recent export can still be a full multi-year account history. Check row count and
   min/max `Post Date` (PowerShell one-liner or a quick Node script) before doing
   anything else. If it spans years, **do not** run the full-file dry run silently —
   tell the user the true range and row count and ask how much of it they actually
   want (this exact situation happened: a "check the file" ask turned out to be a
   2,993-row, 2019–2026 export where a naive import would have inserted 2,270 rows).

3. **Scope to the date range the user wants** (default: last 30 days if they don't
   specify) using `filter-csv-by-date.mjs`:
   ```
   node scripts/filter-csv-by-date.mjs "<input.csv>" "<scratchpad>/filtered.csv" --days=30
   ```
   Write the output to the session scratchpad directory, never back into the
   project or over the user's original download.

4. **Dry-run the standard importer** for categorization visibility:
   ```
   node scripts/import-csv.js "<scratchpad>/filtered.csv" --dry-run
   ```
   This reports would-import count, duplicate/pending/transfer/refund-credit skip
   counts, and flags rows that fell into the "Miscellaneous" fallback category
   (unrecognized merchant). Note the flagged list — you'll revisit it in step 6.

5. **Run the real dedup check** — this is the step that actually protects against
   double-entry:
   ```
   node scripts/compare-transactions.mjs "<scratchpad>/filtered.csv"
   ```
   Read the three buckets:
   - **Exact duplicates** — date+amount+details all match an existing row. Safe to
     skip, no need to show the user the full list unless they ask.
   - **Fuzzy matches** — same date+amount, different details text. **Show these to
     the user explicitly** with the CSV text vs. the DB text side by side. These are
     virtually always the same transaction already entered under a cleaner name — but
     confirm with the user rather than silently dropping them, especially the first
     time you see this pattern in a session. If the user wants extra confidence, widen
     the compared window a few days past the edges of the filtered range (rerun
     `filter-csv-by-date.mjs` with `--start`/`--end` covering the buffer) and rerun the
     comparison — a clean, boundary-crossing sample of fuzzy matches following the
     same truncation pattern is strong evidence there's no coincidental collision.
   - **Genuinely new** — no match at all. These are the actual insert candidates.

6. **Resolve flagged categories.** Cross-reference the "genuinely new" list against
   the flagged-Miscellaneous merchants from step 4. Ask the user if they want to
   recategorize any before insert (e.g. a fast-food chain landing in Miscellaneous
   because it's not yet in `scripts/import-csv.js`'s `CATEGORY_RULES`). Don't guess
   silently — ask, since this affects budget-vs-actual reporting on the Dashboard.

7. **Build the review JSON.** Fetch `categories` (id/name/type) from Supabase for
   this user and write a JSON array to the scratchpad — one object per genuinely-new
   row: `{ date, type, category_id, categoryName, amount, details }`. Keep
   `categoryName` in the file purely for human readability during review; it gets
   stripped before insert. Apply any category corrections from step 6 with `Edit`,
   confirming each change back to the user.

8. **Confirm before writing.** This is a real, hard-to-reverse write to the user's
   financial data — always get an explicit go-ahead on the final row count/category
   breakdown before inserting, even if earlier steps were already approved.

9. **Insert:**
   ```
   node scripts/insert-reviewed-transactions.mjs "<scratchpad>/reviewed.json"
   ```
   This signs in, strips `categoryName`, inserts, and prints back each inserted row's
   new `id` — use that output to confirm the count matches what was reviewed.

10. **Report results plainly**: how many inserted, into which categories, and the
    date range covered. Don't re-run `import-csv.js` in non-dry-run mode for the same
    file afterward — it would re-derive its own (weaker) dedup and could double-insert
    the fuzzy-match rows this workflow deliberately excluded.

## Gotchas learned

- `import-csv.js`'s non-dry-run mode **renames/archives the source CSV** on success.
  Never point it at the user's original download when you're not 100% sure you want
  the whole file imported — always work off a filtered scratchpad copy.
- PowerShell `Import-Csv`/`Export-Csv` round-trips fine but is slower to iterate on
  than a small Node script; `filter-csv-by-date.mjs` exists so the whole pipeline can
  run through `node`/Bash without shell-specific one-liners.
- Node's ESM resolver requires scripts to live under the project root (with its
  `node_modules`) to resolve bare imports like `csv-parse` — a script dropped in the
  OS temp/scratchpad directory will fail with `ERR_MODULE_NOT_FOUND`. Keep all
  `.mjs` helper scripts in `scripts/`, and only write data files (filtered/reviewed
  CSV & JSON) to the scratchpad.
- Never print or log the contents of `supabase connection.txt` — scripts read it
  internally to sign in but should never echo the password to stdout.
