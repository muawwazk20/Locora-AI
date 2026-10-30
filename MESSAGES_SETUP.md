# Private messages setup

One-time setup for attendee ↔ organizer messaging (`api/messages.ts`,
Messages inbox at `/messages`). No new Vercel environment variables are
needed — the Supabase and Gmail variables are already set.

## 1. Create the `messages` table (Supabase → SQL Editor → New query)

```sql
create table if not exists messages (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table messages enable row level security;
```

(Enable RLS the way the other tables were created. The serverless
function uses the service-role key, which bypasses RLS, so reads/writes
from the app keep working.)

Until this table exists, the endpoint answers 503 "Messages are not set
up yet" and the inbox shows that instead of faking any messages.

## 2. Create the Storage bucket for attachments (Supabase → Storage)

- Create a bucket named exactly `message-attachments`.
- Make it **Public** (so a recipient can open a file from its link).
- No policies to write by hand: uploads go through signed URLs that
  `api/messages.ts` issues after checking the file type (video, image,
  PDF, Word, spreadsheet), the 20MB size limit, and that the sender is
  allowed to contact the recipient about that event.

Until the bucket exists, text messages work normally but any attachment
upload fails with a clear "attachments are not set up yet" error.

## 3. Deploy

Pushing to `main` redeploys on Vercel automatically. No env var changes,
no redeploy step beyond that.

## How it works

- A thread is one (event, attendee, organizer) conversation. The
  attendee starts it from the event page's "Message organizer" button.
- An attendee may only message the event's organizer (taken from the
  stored event row, never from the caller's claim). An organizer may
  only reply inside a thread the attendee already started — organizers
  cannot cold-message anyone. Nobody can message themselves.
- A new message emails the recipient (existing Gmail setup,
  best-effort — a mail failure never unsends the message).
- Files never travel through Vercel (serverless payloads cap around
  4.5MB): the browser uploads straight to Storage with the signed URL,
  and only the file metadata reaches the API.
- Sending feels instant: the bubble appears immediately as a normal
  sent message (optimistic UI) — there is no "Sending…" state. When
  the post returns, the server copy swaps in during the same render,
  so there is no gap and no duplicate. A failed send stays visible
  with a Retry button instead of vanishing. The inbox refreshes every
  3 seconds while open. Edits also apply optimistically: the edited
  text shows at once and reverts only if the server patch fails.
- Message actions (right-click / long-press on a bubble): Delete for
  everyone (sender only, any time — removes the row and, best effort,
  its Storage object), Delete for me (either side, any time — hides it
  for that user only via a hiddenFor list), Edit (own text only,
  within 1 hour of sending; the bubble then shows "edited"). Deletes
  have no time limit; the 1-hour limit applies to edits only.
- Deletes are confirmed first (shared Modal dialog), then hidden
  locally at once with a "Message deleted" toast and an Undo button.
  The real server call only runs when the 3-second toast expires, so
  Undo needs no server-side restore; leaving the page inside the
  window flushes the pending deletes immediately. Dismissing the toast
  (X) only hides it — the delete still runs; only Undo cancels it.
  A full browser refresh inside the 3s window is the one exception:
  the timers die with the page and the message comes back.
- Honest limit, same as registrations: there is no session auth, so
  sender/recipient checks trust the signed-in email the app sends.
  They stop misuse through the API, but they are not proof of identity
  the way a signed session would be.
