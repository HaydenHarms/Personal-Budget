# Blockers

## Supabase login credentials in `supabase connection.txt` are invalid (2026-07-05)

`supabase auth.signInWithPassword` with the email/password recorded in `supabase connection.txt`
returns `Invalid login credentials`.

Confirmed via `supabase.auth.signUp` with the same email that **the account already exists**
(Supabase returns a user object with `identities: []` and no error for an already-registered,
confirmed email — this is its anti-enumeration behavior for signUp). So the account is real; the
stored password just doesn't match it.

The Supabase URL and anon key in that file are confirmed valid and reachable (anonymous REST
query against `categories` returns HTTP 200).

**Needs a human:** either the correct password, or a password reset for
`harms.e.hayden@gmail.com` in the Supabase dashboard (Authentication → Users). I did not attempt
further password guesses since that would be indistinguishable from credential brute-forcing.

**Blocks:** end-to-end verification of Phase 0 DoD (authenticated query against `categories`) and
Phase 1 DoD (can log in). The app code for both phases is written and builds cleanly — it just
hasn't been verified against a live login yet.
