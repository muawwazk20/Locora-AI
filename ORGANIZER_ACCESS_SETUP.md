# Organizer Access Setup — Locora

## What changed

Posting events is no longer something a visitor can choose for themselves:

- **Everyone starts as an attendee.** The sign-up role toggle is gone, the
  Google sign-in role parameter is ignored, the instant demo role switch is
  gone, and the demo "email contains org" organizer heuristic is gone.
- **Organizer status comes only from an admin approval.** An attendee
  requests access from their Profile page (or from the blocked organizer
  page). An admin approves or rejects it on the `/admin` page.
- **Admins are the two admin accounts**, identified by email. Admins must
  sign in with Google, so Google verifies their email. The password
  sign-in fallback refuses admin emails. **Never put an admin password in
  the app, in this document, or in chat** — passwords are not how admin
  status works here, and anything written into the app's code is visible
  to anyone who views the site source.
- **Admins can remove organizers at any time.** The `/admin` page has an
  "Approved Organizers" list with a Remove button (click once to arm,
  click again to confirm). A removed organizer immediately becomes an
  attendee again — their organizer pages and links stop working on their
  next navigation — and they may request access again afterwards. Admins
  themselves cannot be removed this way.
- **Organizer pages are guarded.** `/organizer/dashboard`, `/organizer/events`,
  `/organizer/events/new`, `/organizer/events/:id/edit`, and
  `/organizer/events/:id/attendees` render only for approved organizers and
  admins. Everyone else sees an explanation and a request button. The
  navbar only shows Organizer Hub / Post Event to organizers and admins.

## Step 1 — No new Vercel variables

The API reuses the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
variables (the same ones the shared events API uses).

## Step 2 — Create the table in Supabase

Supabase (Locora project) → SQL Editor → New query → paste → Run:

```sql
create table organizer_access (
  email text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
```

If it asks about Row Level Security, choose **Run and enable RLS**, the same
as the events table. No policies are needed: only the server's service key
touches this table, and browsers never call Supabase directly — they call
`/api/organizer-access`, which checks admin status on the server before any
approve, reject, or list action.

## Step 3 — Test the flow

1. Sign in as an admin with Google (an admin email). Open `/admin` — it
   should load with "No pending organizer requests right now."
2. In another browser (or an incognito window), sign up as a new attendee.
   Open Profile → Organizer Access → **Request Organizer Access**. It
   should change to pending.
3. Back on `/admin`, reload. The request should appear. Click **Approve**.
4. As the attendee, reload any organizer page (for example
   `/organizer/events/new`). The posting form should now open.
5. As the attendee, confirm the navbar no longer showed Post Event before
   approval, and that sign-up offers no organizer option.

## Until step 2 is done

If the table does not exist yet, the API answers 503 and the app fails
closed: nobody is treated as an approved organizer from local data alone.
The one exception is a Google-signed-in admin, so admins are never locked
out of their own site by a missing table. Attendees will see the request
form, but sending a request will fail with the setup message until the
table exists — that is expected, and the message says what to run.

## Honest limitation — read this before relying on it alone

This closes every path inside the app, but Locora's sign-in session today
lives in the browser's local storage and the shared events API accepts
event posts without a server-verified session. That means a technically
skilled person who edits their own browser storage, or calls
`/api/events` directly, could still bypass the in-app gates. A fully
tamper-proof version needs server-side session authentication (a verified
session token checked by the events API on every create/edit/delete) and a
server-owned users table. That is a larger change than this one; treat the
current fix as closing the product paths every normal user can reach, not
as a security boundary against a determined attacker. If that boundary
matters for launch, say so and it can be built next.
