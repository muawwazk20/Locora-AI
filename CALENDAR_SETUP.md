# Google Calendar sync — setup guide

Locora can add events a user registers for to that user's own Google
Calendar. This is optional: registration works fine without it, and the
`.ics` download remains the no-setup fallback.

## How it works

1. The user clicks **Connect Google Calendar** (Profile page) or the
   calendar button on an event page after registering.
2. They are sent to Google's consent screen for one extra permission:
   `https://www.googleapis.com/auth/calendar.events` (create events on
   their calendars), plus the sign-in scopes the app already uses.
   This reuses the **same OAuth client and the same Authorized redirect
   URI as sign-in** (`/api/auth/callback/google`), so no new redirect URI
   has to be registered.
3. The callback stores only the **refresh token**, encrypted with AES-GCM
   (key derived from the server-only `GOOGLE_CLIENT_SECRET`), in Supabase
   under that Locora user's id. Access tokens are minted from it on demand
   and are never stored.
4. When the user registers for an event and their calendar is connected,
   the server inserts that event into their primary Google Calendar.
   Cancelling the RSVP deletes the calendar entry Locora created.
   Locora never lists or reads the user's other calendar events.
5. **Disconnect** on the Profile page deletes the stored connection.
   If the user revokes access in their Google Account, the next calendar
   use detects it, deletes the stale connection, and asks them to reconnect.

## Setup steps (do these once)

### 1. Google Cloud Console — enable the Calendar API

In the same project as the sign-in OAuth client:

- **APIs & Services → Library** → search **Google Calendar API** → **Enable**.

### 2. Google Cloud Console — add the calendar scope

- **APIs & Services → OAuth consent screen → Data Access → Add or remove
  scopes** → add `https://www.googleapis.com/auth/calendar.events`
  (filter by "Google Calendar API" if it is not listed, and make sure step
  1 is done first) → **Save**.
- No new redirect URI and no new OAuth client are needed.

Note on publishing status (same as sign-in): in **Testing** mode only
listed test users (max 100) can connect, and their tokens expire after
7 days, so they reconnect weekly. Published-but-unverified apps show an
"unverified app" warning and are capped at 100 users. Full public use
needs Google's (free) verification — privacy policy, verified domain,
and a justification for the calendar scope. For the hackathon and early
users, Testing mode is enough.

### 3. Supabase — create the connections table

In the **Locora** Supabase project, **SQL Editor → New query**, run:

```sql
create table calendar_connections (
  user_id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
```

At the RLS prompt, choose **Run and enable RLS** (same as the events
table): with no policies, only the service-role key can touch this table,
and only the Vercel functions ever hold that key. Browsers never see it.

### 4. Vercel — nothing new to add

No new environment variables are needed. The calendar flow reuses
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (sign-in) and
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (shared events), all already
set for Production. Just let Vercel deploy the `main` branch push that
added this feature (it auto-deploys on push).

## How to test it

1. Sign in, go to **Profile → Google Calendar → Connect Google Calendar**,
   consent with a Google account, and confirm the Profile page shows
   "Connected as \<your email\>".
2. Register for an event on its details page. You should see
   "Added to your Google Calendar", and the event should appear in that
   Google account's calendar.
3. Cancel the RSVP: the calendar entry Locora created should disappear.
4. **Disconnect** on the Profile page: the status should go back to
   disconnected, and registering again should not touch the calendar.

## Troubleshooting

- **"Google Calendar storage is not configured"** — a Supabase env var is
  missing in Vercel Production, or the `calendar_connections` table does
  not exist yet (step 3).
- **"Google Calendar connection incomplete"** — Google did not return a
  refresh token. Remove Locora from that Google account's permissions at
  myaccount.google.com/permissions and connect again (the connect flow
  asks for fresh consent every time, which normally prevents this).
- **Connect button goes to Google but the scope list has no calendar
  permission** — the calendar scope was not added to the consent screen
  (step 2), or the Calendar API is not enabled (step 1).
- **Connection stops working after a week** — expected in Testing mode
  (7-day token expiry). Reconnect, or complete Google verification for
  production use.
- **API errors mentioning quotas** — the Calendar API is free within
  Google's published limits (10,000 requests/min/project,
  1,000,000/day threshold). One registration is one insert, so normal
  Locora usage is far below them.

## Universal "Add to Google Calendar" button (works for everyone, no verification)

The event details page also has a second, verification-free path: when the
visitor has **not** connected via OAuth, it shows an "Add to Google Calendar"
button that links to Google Calendar's public template URL
(`calendar.google.com/calendar/render?action=TEMPLATE`) with the event's
title, dates, venue, and description prefilled. The visitor clicks Save in
their own Google Calendar — no Locora permission, no test-user list, and no
Google verification is involved, so it works for every user, including guests.

Differences from the OAuth connection, stated honestly:

- The template link adds **one event, once**, chosen by the visitor. It does
  not auto-add on registration and does not auto-remove on cancellation.
- The OAuth connection (Profile → Connect) is the automatic version, and it
  becomes available to everyone only after Google verification (see
  GOOGLE_VERIFICATION_PACK.md). Until then it is limited to test users.
- The template button is hidden for OAuth-connected users so they never get
  a duplicate event on top of the automatic one.
