# Google OAuth Verification Pack — Locora

Goal: move Locora's Google OAuth app from **Testing** to **Production +
verified**, so any Google user can connect Google Calendar — not just the
accounts on the test users list.

No code change is needed for this. The gate is Google's review status, not
the app. The app already implements the full flow (connect → register →
calendar event created → cancel → calendar event removed).

> Never paste secrets into the Google Console or this document. The Google
> Client ID/Secret and the Supabase service key live only in Vercel
> environment variables.

---

## 1. Before you submit: the domain problem (read this first)

Google verification requires a **homepage URL and a privacy policy URL on a
domain you own and have verified** (via Google Search Console), listed under
Authorized domains on the OAuth consent screen.

Locora currently runs at `locora-hyperlocal.vercel.app`. That is a subdomain
of `vercel.app`, which you do not own, so you almost certainly cannot verify
it as an authorized domain.

**Practical path:** buy a custom domain (any registrar), add it to the
Vercel project, verify it in Search Console, then:

1. In Google Cloud Console → OAuth consent screen → Authorized domains, add
   your domain.
2. Set the homepage URL to `https://YOUR-DOMAIN/landing` and the privacy
   policy URL to `https://YOUR-DOMAIN/privacy` (the page built in this repo
   at `src/pages/PrivacyPage.tsx`, route `/privacy`, linked from the site
   footer).
3. In the same Cloud project → Credentials → your OAuth client, add the
   authorized redirect URI `https://YOUR-DOMAIN/api/auth/callback/google`
   (keep the existing `locora-hyperlocal.vercel.app` URI as well, so the old
   domain keeps working during the switch).
4. In Vercel, set the environment variable `GOOGLE_REDIRECT_URI` to the new
   callback URL for Production and redeploy, so sign-in and calendar connect
   return to the new domain. If this variable is not set, the server builds
   the redirect URI from the request host, which also works — but setting it
   explicitly removes ambiguity.

Do not submit for verification until the privacy page is reachable on the
verified domain. Reviewers open that link.

## 2. OAuth consent screen — what to fill in

- **App name:** Locora
- **User support email:** your developer contact email (the one already on
  the consent screen).
- **App logo:** optional, but a logo helps review. Any square Locora mark.
- **Authorized domains:** your own domain only (see section 1).
- **Application home page:** `https://YOUR-DOMAIN/landing`
- **Application privacy policy link:** `https://YOUR-DOMAIN/privacy`
- **Scopes (already added):**
  - `openid`, `email`, `profile` — Google sign-in (non-sensitive).
  - `https://www.googleapis.com/auth/calendar.events` — Google Calendar
    (sensitive scope, this is the one under review).
- **Publishing status:** keep the app in Testing while you prepare. Publish
  only when you are ready to submit — and note that publishing without
  verification does **not** remove the unverified-app warning or the
  100-user cap for a sensitive scope. Only a passed verification removes
  them.

## 3. Scope justification — copy/paste for `calendar.events`

Use this text (or your own words saying the same thing) when Google asks why
Locora needs calendar access:

> Locora is a hyperlocal event discovery platform. When a user registers for
> a community event on Locora and has connected Google Calendar, Locora
> creates that event on the user's primary Google Calendar so they do not
> miss it, and deletes the calendar event if the user cancels the
> registration. Locora only writes events the user personally registers for.
> It never lists, reads, or copies the user's other calendar events, never
> invites other people, and never shares calendar data with any third party.
> The connection is optional, can be disconnected from the user's Profile
> page at any time, and the stored refresh token is encrypted at rest and
> deleted on disconnect. The scope is required because there is no
> read-only or narrower scope that permits creating and deleting events on
> a user's calendar.

## 4. Demo video script (about 2 minutes, one continuous recording)

Google often asks for a video showing the sensitive scope in use. Record
your screen, signed in as a test user, narrating each step:

1. Open Locora and sign in with Google.
2. Open Profile and show the Google Calendar card; click **Connect Google
   Calendar** and complete Google consent (the testing-mode warning is
   expected and fine for this recording).
3. Show Profile now reading "Connected as \<email\>".
4. Open an event and register for it; show the "Added to your Google
   Calendar" state and the **Remove from Google Calendar** button.
5. Switch to Google Calendar and show the created event with the correct
   title, date/time, and venue.
6. Back on Locora, cancel the RSVP; switch back to Google Calendar and show
   the event is gone.
7. Back on Profile, disconnect Google Calendar.

Upload the video as unlisted (YouTube or Drive) and paste the link where
Google asks for it.

## 5. Pre-submission checklist

- [ ] Google Calendar API is enabled in the same Cloud project.
- [ ] `calendar.events` scope is listed under Data Access.
- [ ] Privacy page is live at `https://YOUR-DOMAIN/privacy` and linked from
      the footer on every page.
- [ ] Homepage is reachable at `https://YOUR-DOMAIN/landing`.
- [ ] Authorized domains contains only domains you have verified.
- [ ] The full flow in section 4 works end-to-end as a test user.
- [ ] Revoke-and-reconnect works: after revoking at
      myaccount.google.com/permissions, reconnecting succeeds.
- [ ] No secrets, keys, or Client ID values appear anywhere in the app,
      this document, or the video.

## 6. Submit, and what happens next

1. OAuth consent screen → **Publish app** (status becomes "In production").
2. **Submit for verification** and answer Google's follow-up questions with
   the justification in section 3 and the video in section 4.
3. Review typically takes days to weeks. Google may ask for clarification —
   answer from the justification text and the privacy page, and keep the
   wording consistent across all three.
4. `calendar.events` is a **sensitive** scope, not a **restricted** scope,
   so this verification does not require a paid third-party security
   assessment (that requirement applies to restricted scopes such as Gmail
   and Drive APIs).

## 7. After approval

- The unverified-app warning disappears and the 100-user cap is lifted.
- Refresh tokens stop expiring after 7 days (the testing-mode limit).
- Users who connected while the app was in Testing should disconnect and
  reconnect once, so their token is issued under the verified app — their
  old testing-mode token will expire after 7 days regardless.
- Keep the privacy page and the justification accurate. If Locora later
  starts reading calendar events or requesting new scopes, that is a new
  verification submission, not an automatic extension.

## 8. Interim option (while verification is pending)

Stay in Testing and add each person's Google email under OAuth consent
screen → Test users (maximum 100 accounts, counted over the app's lifetime).
This covers hackathon judges and demo users, but it is not open to the
general public.
