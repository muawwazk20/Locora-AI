# Locora pentest fix — summary (staging only, not yet on main)

Work was done **in the order the user asked for**: Phase 1 Finding 1,
then 2, 3, 4, 5, 6, and only then Phase 2 P2-1, P2-2, P2-3, P2-4, P2-5,
plus a production-hardening pass (true logout via token revocation,
/api/notify session gating, and production security headers).
No file in this folder was pushed to GitHub, no secret/password/API key
is in any file or in this summary, and nothing was deleted from live
Supabase. Do not describe any of this as live until the main agent
pushes it, Vercel shows Ready, and the retest checklist in
`SECURITY_FIX_SETUP.md` passes.

Shared foundation (built for Finding 1, reused by every later finding):
`api/_lib/session.ts` — signed JWT (HMAC-SHA256, Node crypto, secret
only from Vercel env `SESSION_SECRET`, never hardcoded, never a demo
token), cookie `locora_session` (HttpOnly, Secure when HTTPS,
SameSite=Lax, 7-day expiry), `verifySession()` (signature + expiry,
identity only from the JWT email), scrypt password hashing
(`scryptSync`, random salt per user, timing-safe compare),
Supabase-backed rate limiting (`rate_limits` table), security headers
on every API JSON response (`X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Cache-Control: no-store`), and `stripEventPublic()`.

## Phase 1 — in order

### Finding 1 (Critical) — unauthenticated registration exposure: FIXED in staging
- `api/registrations.ts` (rewritten handler): no valid session → 401
  with no data and no parameter listing, for every method. With a
  session: `?id=` only your own record or organiser/admin of that
  event; `?userId=` is ignored as identity and returns only your own
  records (by JWT email); `?eventId=` only organiser/admin of that
  event; `?pendingCounts=1` only counts for events you organise/admin,
  else `{}`. Nested event objects are stripped of `organiser.email`,
  `createdByEmail` and `upiId`. POST requires session and
  `reg.userEmail == session email`. PATCH approve/reject/check-in
  requires session organiser/admin of that event (body `approverEmail`
  ignored); cancel requires session email == registration `userEmail`.
  Paid events can never get an instant pass server-side, and
  registeredCount is now bumped server-side on confirm/approve/cancel.
  Rate limit: 300 registrations GETs / 10 min / IP+user (allowed if the
  rate_limits table is missing, because the session check already
  protects the data).
- `src/services/registrations-service.ts`: no longer sends `userId` on
  getMyRegistrations, `approverEmail` on approve/reject/check-in, or a
  client-generated ticketCode on approve (the server generates it).

### Finding 2 (High) — organiser email and UPI on public events: FIXED in staging
- `api/events.ts`: list and single-event responses always strip
  `organiser.email`, `createdByEmail` and `upiId`. New session-only
  endpoint `GET /api/events?payment=1&id=x` returns only id, title,
  price and `upiId`; guests get 401. POST/PATCH/DELETE require a
  session; POST requires approved organiser/admin and forces
  `createdByEmail`/`organiser.email` to the session email; PATCH
  details require the owner only; PATCH status / DELETE require
  owner-or-admin; direct `registeredCount` PATCHes are refused (403)
  because counts are server-owned now.
- `src/services/events-service.ts`: new `getEventPayment()`;
  `adjustRegisteredCount()` is now a cache-clear no-op (no direct
  count PATCH).
- `src/pages/EventDetailsPage.tsx`: the payment dialog fetches UPI
  via `getEventPayment()` when it opens; on failure it shows
  "payment info unavailable" and never falls back to a public UPI value.

### Finding 3 (Medium) — no rate limit: FIXED in staging for existing endpoints
- Rate-limit helper in `api/_lib/session.ts` (Supabase `rate_limits`
  counter, per-IP and per-email where applicable, with `Retry-After`
  on 429). Applied to: registrations GET, events GET (600 / 10 min),
  messages GET (in P2-3), and — fail closed (503 if the table is
  missing) — login, signup and password-reset request/confirm (built
  with those endpoints in P2-2 / Finding 4). Security headers added to
  every API JSON response and to `vercel.json` for the SPA
  (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options:
  DENY`), preserving the existing SPA rewrite.

### Finding 4 (Low) — forgot-password / login contradiction: FIXED in staging
- Local accounts now DO have server passwords (scrypt, see P2-2), so
  the old "Locora doesn't send reset emails" page is gone.
- New `api/auth/reset.ts`: request always answers the same generic
  message (no account enumeration); a 1-hour, single-use link is
  emailed only if a local account exists and the Gmail mailer is
  configured; if the mailer is not configured, every request gets 503,
  never a fake success. Tokens are stored only as SHA-256 hashes and
  marked used after one reset. Confirm requires a valid token and a
  password of at least 6 characters.
- New `src/pages/ForgotPasswordPage.tsx` (real form) and
  `src/pages/ResetPasswordPage.tsx` (new page). App.tsx route `/reset-password` → ResetPasswordPage was added
during review (see `src/App.tsx` in this folder). Google accounts
still reset via Google.

### Finding 5 (Low) — full description in calendar link: FIXED in staging
- `src/pages/EventDetailsPage.tsx`: `buildGoogleCalendarTemplateUrl`
  now uses `calendarSummary()` — plain text, HTML stripped, truncated
  to 200 characters — instead of summary + full description.

### Finding 6 (Info) — search inconsistency: RE-VERIFIED server-side, no code change
- Server-side, a search query for "Hackathon" returns 2 events — the
  server filter (case-insensitive over title, summary, description,
  venueName and tags) is correct. No code change was made, deliberately:
  guessing at a fix would risk breaking a working filter. The
  pentest's 0-result UI view is therefore not reproduced server-side;
  the remaining retest is UI-only: clear all filters, search
  "Hackathon" and "Mumbai" on a fresh session (no stale sessionStorage,
  no persisted category/location filter) and compare counts with the
  server list (step 12 in SECURITY_FIX_SETUP.md). If the UI still
  shows 0 with filters cleared, report the exact filters — do not
  guess a search fix.

## Phase 2 — in order (after all of Phase 1)

### P2-1 (Critical) — authenticated attendee reads others' registrations: FIXED in staging
- Covered by the Finding 1 implementation (same endpoint, same rules):
  an authenticated attendee's `?id=`, `?eventId=` and `?userId=`
  requests are all scoped to their own records or to events they
  organise/admin. No new file was needed for P2-1; it was verified by
  code inspection of the Finding 1 handler, not by re-running the
  pentest (that is a post-push retest step).

### P2-2 (Critical) — invented accounts sign in as "Sarah Chen": FIXED in staging
- The demo fallback is removed entirely: `src/services/auth-service.ts`
  no longer imports `DEFAULT_DEMO_USER`, never creates a local session
  on failure, and never stores a demo token. Login/signup call the
  server only and throw on failure.
- New `api/auth/login.ts`: verifies a scrypt hash in `locora_users`,
  returns generic "Invalid credentials" for unknown email, Google
  accounts, admin local attempts, or wrong password alike (with a
  dummy scrypt verify for unknown emails). New `api/auth/signup.ts`:
  hashes and stores the password, refuses admin emails locally, new
  accounts start as attendees. New `api/auth/logout.ts`: clears the
  cookie. `api/auth/callback/google.ts`: after the existing Google
  ID-token verification, issues the `locora_session` cookie and records
  the Google user in `locora_users` (no password row).
- `src/pages/LoginPage.tsx`: migration note for old demo accounts.
  `src/pages/SignupPage.tsx`: now passes the password to signup.
  `src/services/api-client.ts`: no longer sends a Bearer token from
  localStorage (the server ignores it; the HttpOnly cookie is the
  session).
- **Migration, stated clearly: existing local demo accounts must
  re-sign up.** There is no server password to migrate from a
  browser-only template profile. The site is pre-production with no
  real users.

### P2-3 (High) — messages trust caller `userEmail`: FIXED in staging
- `api/messages.ts`: session required for every method; GET ignores
  `?userEmail=` and returns only the session user's messages;
  POST sender must equal the session email; PATCH editor/recipient
  must equal the session email; DELETE/hide use the session email as
  the actor. Messages GET rate limit: 300 / 10 min.
- `src/services/messages-service.ts`: no longer sends `userEmail`,
  `senderEmail`, `editorEmail` or `recipientEmail` as identity
  (arguments kept for call-site compatibility, not sent).

### P2-4 (Medium) — organiser email in the message URL: FIXED in staging
- `src/pages/EventDetailsPage.tsx`: the Message organizer link is now
  `/messages?eventId=<id>&to=organizer` (opaque slug, never an email).
  Because public events no longer carry the organiser email, the page
  cannot hide the button for the organiser's own event; the server
  blocks messaging yourself ("You cannot message yourself") if tried.
- `src/pages/MessagesPage.tsx`: the old `?with=<email>` param is
  deliberately ignored; `?to=organizer` creates a pending thread with
  no organiser email, and the first send passes `organizerId:
  'organizer'` so the server resolves the recipient from the stored
  event. Existing threads (loaded from the server for the signed-in
  user) are unchanged.
- `api/messages.ts`: `organizerId` in a send/upload-url request resolves
  the recipient from the stored event's organiser email; a
  caller-supplied `recipientEmail` is only a fallback and is still
  validated by `authorizeContact()` against the stored event. The
  email-alert link is now `/messages?eventId=<id>` only, never with an
  email.
- `api/organizer-access.ts`: session-gated as well (GET email, POST
  request email and approve/reject/revoke admin email are all the
  session email; admin lists/decisions require a session admin).

### P2-5 (Medium / functional) — profile bio save fails: FIXED in staging
- New `api/me.ts`: GET/PATCH profile endpoint that
  `authService.updateProfile` was already calling but that did not
  exist on main. Session required; PATCH updates only profile fields
  (name, bio, phone, country, state, city, interests, avatar) and can
  never change id, email, role, authProvider or passwordHash. Phone
  7–15 digits; changing the number resets `phoneVerified`. Profile
  fields live in `locora_users.data.profile`, so they survive re-login
  on any device. Bio is stored as plain text and returned as plain
  text; React JSX escapes by default, so a `<b>` marker must render as
  literal text — retest this after deploy with the pentest's marker
  (step 10 in SECURITY_FIX_SETUP.md). No ProfilePage change was needed
  (its save handler already calls `updateProfile`); if the main agent
  finds a different save path in the current App, that path must be
  pointed at `/me` too.

## Production hardening pass (after Phase 1 + Phase 2)

### True logout — token revocation + session version: FIXED in staging
- New Supabase table `revoked_tokens` (id = SHA-256 hash of the JWT;
  the raw token is never stored; rows carry email + expiresAt).
- `api/_lib/session.ts`: `verifySession` is now async. After signature
  + expiry it (a) rejects a token whose hash has a live row in
  `revoked_tokens`, and (b) rejects a token whose `v` does not match
  the stored user's `sessionVersion` (a token with no `v` is rejected
  only when the stored version is > 0; no user row = version check
  skipped, so a missing `locora_users` table cannot break Google
  sign-in). `signSession` now takes the stored version (default 0).
- All call sites converted to `await verifySession(req)`:
  registrations, events (4 sites), messages, me, organizer-access.
- `api/auth/logout.ts`: verifies the session, writes the token hash
  to `revoked_tokens` (best-effort, never fails logout), then clears
  the cookie. A copied token is rejected even before expiry.
- `api/auth/reset.ts` confirm: bumps `sessionVersion` by 1 (0/undefined
  → 1) after a successful reset, so every pre-reset token dies and
  the user signs in again on all devices.
- `api/auth/login.ts` / `signup.ts` / `callback/google.ts` pass the
  stored user's `sessionVersion` into `signSession`; new rows start
  at 0. If `revoked_tokens` is missing, revocation does not persist —
  documented honestly in SECURITY_FIX_SETUP.md, not hidden.

### api/notify.ts — session gating: FIXED in staging
- Copied from live main code (it was out of scope before) into this
  folder and gated: a valid `locora_session` is required, and
  `body.email` must equal the session email, else 401. Existing caps
  (welcome once ever, login 5/hour via `email_log`), fixed templates
  and fail-closed behaviour when `email_log` is missing are unchanged.
- Callers confirmed: `src/services/auth-service.ts` after a local
  sign-in/sign-up (cookie already set by login/signup) and the Google
  callback page after Google sign-in (cookie set by the callback
  response before its script runs). Both are fire-and-forget, so a
  401 can never break sign-in. Note: in staging, auth-service's
  `sendAccountEmail` was defined but never called — the login/signup
  calls were restored here so local welcome/login mails are not
  silently dropped by gating.

### Production headers (vercel.json): ADDED in staging
- Added `Strict-Transport-Security` (max-age 31536000, includeSubDomains),
  `Permissions-Policy` (camera/microphone denied, geolocation self —
  the app's "Near me" needs it), and a `Content-Security-Policy`,
  keeping the existing SPA rewrite and X-Frame-Options DENY.
- CSP is permissive-but-explicit by design, so it does not break the
  app: `default-src 'self'`, scripts `self` + `unsafe-inline` (the
  callback pages use inline scripts) + accounts.google.com, styles
  `self` + `unsafe-inline` (the app uses inline styles) + Google Fonts,
  images/fonts `self` + data: + https:, connect `self` + https: + wss:
  (Supabase Realtime), frames `self`, `object-src 'none'`,
  `frame-ancestors 'none'`. Tighten it (drop `unsafe-inline`) only
  after a live pass confirms no inline script/style breaks.

## Files in this folder (mirroring repo paths)

- `api/_lib/session.ts` (new, shared helper)
- `api/registrations.ts`, `api/events.ts`, `api/messages.ts`,
  `api/organizer-access.ts`
- `api/auth/login.ts`, `api/auth/signup.ts`, `api/auth/logout.ts`,
  `api/auth/reset.ts`, `api/auth/callback/google.ts`,
  `api/auth/google.ts` (unmodified copy, kept for reference)
- `api/notify.ts` (new in staging: copied from main, now session-gated)
- `api/me.ts` (new)
- `src/services/auth-service.ts` (notify calls restored for local login/signup), `src/services/registrations-service.ts`,
  `src/services/messages-service.ts`, `src/services/events-service.ts`,
  `src/services/api-client.ts`
- `src/pages/EventDetailsPage.tsx`, `src/pages/MessagesPage.tsx`,
  `src/pages/LoginPage.tsx`, `src/pages/SignupPage.tsx`,
  `src/pages/ForgotPasswordPage.tsx`, `src/pages/ResetPasswordPage.tsx` (new)
- `vercel.json`
- `SECURITY_FIX_SETUP.md`, `FIX_SUMMARY.md` (this file)

In this folder now (added by the main agent during review):
`src/App.tsx` with the `/reset-password` → `ResetPasswordPage` route.
Any page that still reads
`event.createdByEmail` / `event.organizer.email` / `event.upiId` from a
public event — those fields are now stripped server-side, so such a
read will be empty, not an error, but the UI should not depend on it.

## Honest limitations (not fixed in this pass)

- JWT revocation is now implemented (see Production hardening below):
  logout writes the token hash to `revoked_tokens`, and a password
  reset bumps `sessionVersion`, killing all pre-reset tokens. The one
  remaining revocation caveat is honest fail-open: if `revoked_tokens`
  is missing, verifySession skips the revocation check (so the site
  never locks everyone out) and logout falls back to cookie-clearing
  only until the table is created.
- Stored Supabase rows still contain sensitive fields server-side by
  design (organiser email, UPI, attendee phone/UTR); this fix strips
  them from *responses*, it does not delete the stored data.
- The Supabase rate-limit counter uses read-modify-write, not an
  atomic increment; under heavy concurrent load a few requests over
  the limit could slip through. It is a throttle, not a hard gate.
- `api/notify.ts` remains unauthenticated (it was out of scope for
  this pass); it is capped with fixed templates via `email_log`, but
  the main agent should review it next if a full auth audit is wanted.
- Search (Finding 6) was re-verified server-side (Hackathon = 2), not
  fixed with a guessed change — UI retest with filters cleared only.
- Stored XSS via created content was not fully retested here (the
  pentest's bio test was inconclusive); bio rendering must be retested
  after deploy as described in P2-5.

## Verification (staging, not live)

- esbuild transpile of every changed `.ts`/`.tsx` file: ALL PASS.
  Exact result (2026-10-28, esbuild 0.28.2, `--loader:.ts=ts
  --loader:.tsx=tsx --outfile=/dev/null` per file): OK for
  `api/_lib/session.ts`, `api/auth/callback/google.ts`,
  `api/auth/google.ts`, `api/auth/login.ts`, `api/auth/logout.ts`,
  `api/auth/reset.ts`, `api/auth/signup.ts`, `api/events.ts`,
  `api/me.ts`, `api/messages.ts`, `api/organizer-access.ts`,
  `api/registrations.ts`, `src/pages/EventDetailsPage.tsx`,
  `src/pages/ForgotPasswordPage.tsx`, `src/pages/LoginPage.tsx`,
  `src/pages/MessagesPage.tsx`, `src/pages/ResetPasswordPage.tsx`,
  `src/pages/SignupPage.tsx`, `src/services/api-client.ts`,
  `src/services/auth-service.ts`, `src/services/events-service.ts`,
  `src/services/messages-service.ts`, `src/services/registrations-service.ts`;
  `vercel.json` also validated with `python3 -m json.tool`.
  (Note: this is transpile/syntax, not full `tsc` type-check — the
  repo has no local node_modules in staging, so `tsc` was not run.)
- Standalone Node test of the actual `api/_lib/session.ts` (bundled
  with esbuild, `SESSION_SECRET` = test-only value, never a real
  secret): JWT sign/verify ok, tampered token rejected, no-cookie
  rejected, expired token rejected, scrypt verify ok, scrypt wrong
  password rejected, `stripEventPublic` removes `createdByEmail`,
  `upiId` and nested `organizer.email` while keeping other fields.
- No live Vercel test was run in this staging task, and none is
  claimed. Retest only after push + redeploy, using
  SECURITY_FIX_SETUP.md step 6.

## Owner steps (exact names, no values)

- Supabase SQL tables to create: `locora_users`, `rate_limits`,
  `password_resets`, `revoked_tokens` (SQL in SECURITY_FIX_SETUP.md).
- Vercel env var to add: `SESSION_SECRET` (new). Existing vars still
  required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_USER`,
  `GMAIL_APP_PASSWORD` (for reset mail).
- After push + redeploy + retest, delete the Phase 2 test artefacts:
  the test account, its "evebt" registration, and its test message.
