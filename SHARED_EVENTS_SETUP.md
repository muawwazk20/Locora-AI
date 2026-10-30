# Shared events (so every user sees every user's events)

## The problem this fixes

Events used to live only in each visitor's browser (`localStorage`), so an
event posted by User A on one device was invisible to User B on another
device. Now events live in one shared Supabase table, and the site reads
and writes that table through Vercel functions (`api/events.ts` and
`api/events/[id].ts`). The frontend never talks to Supabase directly, so
the database key never reaches a browser.

Until the setup below is finished, the site keeps working exactly as
before (events saved locally in each browser, not shared) — the shared
API returns 503 and the frontend falls back to local storage. Nothing
breaks in the meantime.

## Setup (one time, ~3 minutes)

1. Go to https://supabase.com/dashboard and create a free project.
2. In that project, open **SQL Editor > New query**, paste this, and run it:

```sql
create table events (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
```

   Leave Row Level Security as it is. The site uses the service-role key
   from the server only, which bypasses RLS; the browser never gets the
   key, so nobody can read or write the table directly from the web.

3. In Supabase, go to **Project Settings > API** and copy:
   - Project URL (looks like `https://xyzcompany.supabase.co`)
   - `service_role` secret key (NOT the `anon` key — keep it secret)
4. In Vercel, open the project that serves `locora-hyperlocal.vercel.app`,
   go to **Settings > Environment Variables**, and add both for
   **Production**, type **Sensitive**:
   - `SUPABASE_URL` = the Project URL from step 3
   - `SUPABASE_SERVICE_ROLE_KEY` = the `service_role` key from step 3
5. **Deployments > latest deployment > Redeploy.** Env vars only take
   effect on a new deployment.

## How to check it worked

1. On one device/browser, create an event (Organizer Hub > Post Event).
2. On a different device/browser (or an incognito window), open Discover.
   The new event should appear there too.
3. If it does not, check Vercel's deployment is Ready and that both env
   vars are set for Production — the shared API returns a plain
   "not configured" message at `/api/events` until they are.

## Notes

- Registrations and saved events are still per-browser local storage for
  now. Only the event list itself is shared, which is what makes every
  user's posted events visible to all users.
- If two people post at the exact same second, the list is stored as one
  JSON array per event row, so there is no shared-write race for creates
  (each create inserts its own row).
