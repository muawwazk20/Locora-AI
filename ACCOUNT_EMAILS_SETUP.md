# Account emails: welcome + new sign-in alerts

Two account emails, sent through the same Gmail setup as the ticket
emails (see ORGANIZER_NOTIFICATIONS_SETUP.md — same `GMAIL_USER` /
`GMAIL_APP_PASSWORD` Vercel env vars, no new credentials):

| Email | When | To |
| --- | --- | --- |
| Welcome to Locora | First sign-in with an email address, once ever | The new user |
| New sign-in to your Locora account | Every sign-in | The user who signed in |

The sign-in email shows the time (IST), the device ("Chrome on
Windows", "Safari on iOS", … — parsed from the browser's User-Agent),
the approximate location (city, region, country from the sign-in IP),
and the IP address itself, plus "If this wasn't you, change your
password right away."

How each sign-in path triggers them:

- **Google sign-in:** the callback page fires both calls after a
  successful sign-in (sign-in alert every time; welcome only the first
  time for that email).
- **Local sign-in / sign-up:** the app fires the matching call after a
  successful local sign-in (`login`) or sign-up (`welcome`).
  Demo-profile sessions (no typed email) send nothing.

## Required: the email_log table

These emails need one small Supabase table, used only to enforce the
caps below. Run this in Supabase → SQL Editor, choosing "Run and
enable RLS" if asked (same as the events table):

```sql
create table if not exists email_log (
  email text not null,
  kind text not null,
  created_at timestamptz default now()
);
```

Until this table exists, the endpoint fails CLOSED: it answers
`{ mailed: false, reason: "email-log-unavailable" }` and sends nothing.
This is deliberate — without the cap check, the endpoint could be
abused to mail arbitrary addresses, so a missing table must never mean
"send anyway". Ticket emails (organizer approval, attendee
confirmation/pending) do NOT need this table and keep working without
it.

## Caps (abuse guards)

Local accounts live only in the browser, so the server cannot
independently verify that a sign-in really happened. These caps bound
what an unauthenticated caller can trigger:

- Welcome: at most once per email address, ever (a repeat sign-up with
  the same email sends no second welcome).
- Sign-in alerts: at most 5 per email per hour.

Templates are fixed; the only caller-controlled text is the display
name, which is HTML-escaped and length-limited.

## Location note

The sign-in location comes from a free IP lookup (ip-api, server-side,
3-second timeout). It is approximate (city-level at best) and is
omitted ("Unknown location") when the lookup fails or the IP is
private. The IP address itself is sent to ip-api for that lookup.
