# Blockers

None currently open.

## Resolved: Supabase login credentials were stale (2026-07-05)

The password originally in `supabase connection.txt` didn't match the account. Resolved with a
corrected password; `supabase connection.txt` has been updated (not committed to git — see
`.gitignore`). Authenticated sign-in now succeeds.

**Follow-up observation (not blocking):** an authenticated query against `categories`, `settings`,
and `transactions` all returned 0 rows for this user, despite BUILD_PLAN.md section 3 claiming a
`settings` row was already seeded. Likely explanation: the auth user was recreated at some point
(new UUID), orphaning any previously-seeded data under the old user ID. Practical impact is
minimal — Phase 2 (Settings) upserts a row on first save regardless, and Phase 8 (Data Migration)
will populate categories/budget/transactions from `Personal_Budget.xlsx` under whatever the
current user ID is. No action needed unless old orphaned data needs to be recovered, which would
require dashboard/service-role access to inspect.
