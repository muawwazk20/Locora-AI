# Locora security fix — setup (owner steps, no values in this file)

**Staging only, not yet on main.** The main agent must verify and push
these files, then the owner must complete the steps below and redeploy
before retesting. No secret, password, API key or admin password is in
any fix file.

## 1. Supabase SQL (run in the Supabase SQL editor, same project as events)

Existing tables used by this fix (already created in earlier work):
`events`, `registrations`, `messages`, `organizer_access`,
`email_log`, `phone_verifications`, `message-attachments` bucket.

New tables for this fix — create all four, or the auth/rate-limit
paths fail closed as described below:

```sql
-- Local accounts: one row per email. data is jsonb with:
-- { email, name, role, authProvider, passwordHash (local only),
--   profile: { bio, phone, phoneVerified, country, state, city,
--              interests, avatar }, createdAt }
create table if not exists public.locora_users (
  id text primary key,
  data jsonb not null
);

-- Per-IP / per-email rate-limit counters. data is jsonb with:
-- { count, windowStart (epoch ms) }
create table if not exists public.rate_limits (
  id text primary key,
  data jsonb not null
);

-- Password-reset tokens. Only the SHA-256 hash is stored, never the
-- raw token. data is jsonb with:
-- { email, tokenHash, expiresAt (ISO), used (bool), createdAt (ISO) }
create table if not exists public.password_resets (
  id text primary key,
  data jsonb not null
);

-- Revoked session tokens (production hardening: true logout).
-- id IS the SHA-256 hash of the JWT — the raw token is never stored.
-- data is jsonb with: { tokenHash, email, expiresAt (ISO) }
-- Rows past expiresAt are inert (verifySession ignores them); they
-- can be pruned with: delete from public.revoked_tokens where
-- (data->>'expiresAt')::timestamptz < now();
create table if not exists public.revoked_tokens (
  id text primary key,
  data jsonb not null
);
```

Row Level Security: follow the existing pattern for `events` /
`registrations` in this project (service-role key bypasses RLS; the
browser never talks to Supabase directly for these tables, only the
Vercel functions do, with `SUPABASE_SERVICE_ROLE_KEY`).

What happens if a table is missing:
- `locora_users` missing → login/signup/reset/me return 503.
- `rate_limits` missing → login, signup and reset return 503
  (fail closed for auth); registrations/messages/events GETs still
  work (session check already protects the data) but are not
  rate-limited until the table exists.
- `password_resets` missing → reset confirm returns "invalid or
  expired" (the token row cannot be stored/found).
- `revoked_tokens` missing → sessions still work and logout still
  clears the cookie, BUT revocation does not persist: a copied token
  stays valid until its 7-day expiry, and a password reset still
  bumps sessionVersion (see below) so old tokens die only if
  `locora_users` is present. This is the one deliberate fail-open:
  a missing revocation table must never lock every user out.
  Create the table before calling logout "fully fixed".

## 2. Vercel environment variables (Production)

New, required:
- `SESSION_SECRET` — a long random secret, generated once by the owner
  (e.g. 64 random hex characters). Never hardcode it, never put it in
  a `VITE_` variable, never paste it in chat. If it changes, all
  existing sessions stop working and users must sign in again.

Existing, still required (no values here — they are already set):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD` (only needed for password-reset emails and the
  existing notify emails; without it, reset requests return 503, not a
  fake success)

After setting `SESSION_SECRET` (and creating the tables above):
redeploy the Production deployment once, and confirm it shows Ready
before claiming anything works live.

## 3. App.tsx route wiring (already in this folder)

One route was added in staging (`src/App.tsx`), otherwise the emailed reset link would have nowhere to land:
- `/reset-password` → `ResetPasswordPage` (new file in this folder:
  `src/pages/ResetPasswordPage.tsx`).

No other route changes are needed. The old `/messages?with=<email>`
deep link is deliberately ignored now; the new link is
`/messages?eventId=<id>&to=organizer`.

## 4. Migration note — old local accounts

Existing local demo accounts will **not** work after this fix. They
were browser-only template profiles with no server password, and there
is no password to migrate. Affected users must sign up again with the
same email (LoginPage now says this). The site is pre-production with
no real users, so this is the intended migration, not a data loss.

## 4b. Session version (how old tokens die)

`locora_users.data` now carries `sessionVersion` (0 for every new
account, local or Google). Every issued JWT carries it as `v`, and
`verifySession` rejects a token whose `v` does not match the stored
value (a token with no `v` is rejected only once the stored version
is > 0). Two things kill old tokens server-side:
- **Logout** writes the token's SHA-256 hash to `revoked_tokens`.
- **Password reset confirm** bumps the user's `sessionVersion` by 1,
  so every token issued before the reset is rejected — the user must
  sign in again on all devices. This is true remote logout for the
  reset case, without a revocation list lookup for every other token.

## 5. Test artefacts — do NOT delete yet

Do not delete anything from live Supabase in this staging task. After
the fix is pushed, verified and retested, the owner should delete:
- the Phase 2 test account (email in the Phase 2 report),
- its one "evebt" registration,
- its one test message to the "evebt" organiser.
Only after verification — deleting first would destroy the evidence
needed to confirm the fix.

## 6. Retest checklist (after push + redeploy)

1. Unauthenticated: `GET /api/registrations`, `?eventId=…`,
   `?id=…`, `?userId=…`, `?pendingCounts=1` → 401, no data, no
   parameter listing. `GET /api/messages` (no params) → 401.
2. Unauthenticated: `GET /api/events` and single event → 200 but with
   NO `organiser.email`, `createdByEmail` or `upiId` anywhere.
3. Signed in as an attendee: `GET /api/registrations?userId=<other>`
   → only your own records. `GET /api/registrations?eventId=<other's>`
   → 403. `GET /api/registrations?id=<other's>` → 403.
4. Signed in: `GET /api/events?payment=1&id=<paid event>` → only
   id/title/price/upiId. Signed out: same URL → 401.
5. Invented email + invented password at /login → "Invalid
   credentials", no sign-in, no demo profile.
6. Sign up with a new email + password → signed in; sign out, sign in
   with the wrong password → "Invalid credentials".
7. Forgot password → request (generic message), click the emailed
   link, set a new password, sign in with it; an expired/reused link
   → "invalid or has expired".
8. Rate limiting: hammer an auth endpoint past its limit → 429 with
   `Retry-After`; hammer a registrations GET past 300/10 min → 429.
9. Messages: as attendee A, `GET /api/messages?userEmail=<B>` → only
   A's messages. Event page Message organizer link → URL contains
   `to=organizer`, never an email; first message sends to the stored
   organiser.
10. Profile: save a bio containing `PENTEST-MARKER-20261028 <b>boldcheck</b>`
    → save succeeds, reload shows the same bio, and the `<b>` renders
    as literal text, not bold.
11. Calendar: open an event, copy the Google Calendar template link →
    `details` is at most 200 chars, plain text, no full description.
12. Search: clear all filters, search "Hackathon" and "Mumbai" with no
    category/location filter set, on a fresh session (no stale
    sessionStorage) → compare counts with the server list; report any
    remaining mismatch with exact filters, do not guess.
13. Logout / revocation: sign in, copy nothing, sign out, then reuse
    the pre-logout session (same cookie) against /api/registrations
    → 401. Password reset: sign in on one session, reset the password
    via the emailed link, then reuse the pre-reset session → 401.
14. Notify gating: unauthenticated POST /api/notify → 401; signed in
    as A, POST /api/notify with email = B → 401; signed in as A with
    email = A → 200 (mailed true/false per the existing caps).
15. After all of the above passes, delete the Phase 2 test artefacts
    listed in step 5.
