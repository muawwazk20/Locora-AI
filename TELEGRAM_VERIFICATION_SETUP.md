# Telegram phone verification — setup

Free mobile verification, no SMS. A user taps "Verify via Telegram" on
their Locora profile, opens a one-time bot link, and shares the phone
number Telegram already verified. Locora matches it to the profile
number and marks it verified. The bot token is a secret and must never
be pasted in chat or committed to the repo.

## 1. Create the bot (2 minutes)

1. In Telegram, open [@BotFather](https://t.me/BotFather) and send
   `/newbot`.
2. Pick a display name (e.g. `Locora Verify`) and a username (e.g.
   `LocoraVerifyBot`). BotFather replies with a bot token.
3. Keep the token secret. You will need it exactly twice below (env
   var + webhook URL) — never share it or screenshot it.

## 2. Create the table in Supabase

In the Locora project's SQL Editor, run:

```sql
create table if not exists phone_verifications (
  token text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
```

Then enable Row Level Security on it, exactly like the other tables
(the service-role key used by the API bypasses RLS).

## 3. Add environment variables in Vercel (Production)

| Variable | Value | Sensitivity |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | The BotFather token | Sensitive |
| `TELEGRAM_BOT_USERNAME` | The bot username, without `@` (e.g. `LocoraVerifyBot`) | Plain |
| `TELEGRAM_WEBHOOK_SECRET` | Any random string you make up (e.g. 32 random letters) | Sensitive |

The webhook secret is what proves Telegram updates are really from
Telegram. Without it, the webhook ignores every update (fail closed).

## 4. Point Telegram at the site

Open this URL in your browser (replace `<TOKEN>` and `<SECRET>`):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://locora-hyperlocal.vercel.app/api/telegram-verify&secret_token=<SECRET>
```

Expect `{"ok":true,...}`. That URL contains the bot token — do not
share it.

## 5. Redeploy

Vercel env vars only apply to new deployments, so redeploy (any push
does it) after steps 2–4.

## 6. Test

1. On the site, go to Profile, save a mobile number, and tap
   "Verify via Telegram".
2. Open the link, tap "Share my phone number" in the bot chat.
3. The profile should show the number as verified within seconds.
4. Register for an event: the organizer's Attendees page shows
   "✓ Verified" next to the number.

## How it works (and its limits)

- Links last 15 minutes and are one-time per email (a new link drops
  the old pending one).
- A shared number must match the profile number (last-10-digits
  comparison, so a +91 prefix difference is fine). A mismatch keeps
  the request pending and tells the user which number to share.
- Users without Telegram cannot use this method (missed-call
  verification is the planned fallback).
- Trust note: the profile's verified badge is set from the browser
  after polling, so in this app's session model it is a display flag.
  The organizer-facing "✓ Verified" on a registration is different:
  `api/registrations.ts` re-checks the verification rows server-side
  before stamping it, and a client-sent flag is never trusted.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Telegram verification is not set up yet (bot username missing)" | `TELEGRAM_BOT_USERNAME` not set, or no redeploy after setting it |
| "Verification table is not set up yet" | Step 2 not run |
| Bot never replies / nothing happens | Webhook not set (step 4), or the secret in step 4 doesn't match `TELEGRAM_WEBHOOK_SECRET` |
| "This link expired" | 15 minutes passed — get a fresh link from Profile |
| "Doesn't match the number on your profile" | The Telegram account's number differs — share the profile number, or update the profile number and get a fresh link |
