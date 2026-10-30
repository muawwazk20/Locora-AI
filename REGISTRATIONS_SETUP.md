# Shared Registrations Setup (manual-approval payments)

Registrations used to live only in each browser's localStorage, so an
organizer could never see — let alone approve — a payment submitted from
another device. The new `api/registrations.ts` function stores them in
Supabase instead, using the same pattern as the shared events table.

## One-time setup (Supabase, ~2 minutes)

1. Open the **Locora** project in Supabase → **SQL Editor** → **New query**.
2. Run this (it creates the table the same way the events table was made):

```sql
create table if not exists registrations (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
```

3. At the RLS prompt, choose **Run and enable RLS** (same as events).
   The API uses the service-role key, which bypasses RLS, so no policies
   are needed. No new Vercel env vars: `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are already set.
4. Redeploy in Vercel (or wait for the next push to deploy).

## How it works after setup

- **Free events** — unchanged: instant confirmed pass with a ticket code.
- **Paid events** — the attendee pays the organizer directly via UPI
  (the organizer's UPI ID from the event form, if they set one), enters
  the 12-digit UTR, and gets a **pending** registration. A pending
  payment holds a spot (the event's registered count goes up), but no
  pass is issued yet.
- **Organizer approval** — the event's Attendees page shows a "Pending
  payment approvals" section. The organizer checks the UTR in their own
  bank/UPI app, then **Approve & Issue Pass** (pass + ticket code
  issued) or **Reject** (held spot released). The organizer's event list
  also shows a "N pending" badge per event.
- **Attendee view** — My Registrations shows pending payments under
  Upcoming with their UTR; the event page shows "Payment pending
  approval" until approved, or "Payment not approved" with a retry
  button if rejected. Pending and confirmed registrations can both be
  cancelled (releasing the held spot).

## Before the table exists

`/api/registrations` returns a 503 "not configured" JSON and the app
falls back to per-browser local registrations — exactly like events did
before their table existed. In that mode a pending payment is only
visible on the device that submitted it, so cross-device approval does
not work until the table above is created. Nothing breaks; approval
just can't cross devices yet.

## Security note

There is no session auth yet, so the API's approve/reject checks trust
the approver email the caller sends (it must match the event owner's
email or an admin email, checked against the stored event row). That
stops casual misuse from the app's UI, which only ever sends the
signed-in user's email — but it is not proof of identity the way a
signed session would be. In-app ownership gating is the real control
until server-side session auth exists.
