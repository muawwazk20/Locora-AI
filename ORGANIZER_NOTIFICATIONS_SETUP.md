# Organizer notifications for pending payments

When an attendee submits a payment for a paid event, the registration is
stored as **pending** and the organizer must approve it before a pass is
issued. The organizer is told about it two ways:

1. **In the app (always works):** the organizer's event list shows a
   "N pending" badge, and the event's Attendees page has a "Pending
   payment approvals" section with Approve / Reject buttons.
2. **By email (needs the setup below):** the organizer also gets an
   email with the attendee's name and email, the amount, the UTR, and a
   link straight to the Attendees page.

Email is sent from the organizer-notification code in
`api/registrations.ts` (it runs when a pending registration is stored).
It is best-effort: if email is not configured, or sending fails, the
registration still succeeds and the in-app badge still shows.

## Setup (about 5 minutes, one time)

Email goes out through a Gmail account using an app password. Any Gmail
account works, and it can send to any organizer's email address — no
custom domain is needed.

1. On the Gmail account you want to send from, turn on 2-Step
   Verification (Google Account → Security → 2-Step Verification).
2. Create an app password: Google Account → Security → App passwords →
   create one (name it "Locora"). Google shows a 16-character code.
   **This is not your Gmail password — never share it in chat.**
3. In Vercel → your project → Settings → Environment Variables, add
   (Production, Sensitive):
   - `GMAIL_USER` — the full Gmail address from step 1.
   - `GMAIL_APP_PASSWORD` — the 16-character code from step 2
     (spaces don't matter; they are stripped).
4. Redeploy (or wait for the next push to deploy).

## Attendee confirmation emails

The same Gmail setup also sends confirmation emails to attendees — no
extra configuration:

- A **free** registration issues its pass instantly and emails the
  attendee a confirmation with the ticket code.
- An **approved** paid registration emails the attendee their pass
  (ticket code) at approval time.
- The recipient is the registration's own email address, and the email
  links back to the event page.

## Requirements and limits

- The organizer approval email only fires for **pending** registrations
  (paid events). Free events issue passes instantly, so there is
  nothing to approve — but the attendee still gets the confirmation
  email above.
- Email requires the shared `registrations` table (see
  `REGISTRATIONS_SETUP.md`). Without it, registrations only live in the
  attendee's browser, the server never sees them, and no email is sent.
- The recipient is always the **stored event's organizer email** (read
  server-side from the event record), never an address from the request,
  so the endpoint cannot be used to send mail to arbitrary addresses.
- Gmail allows roughly 500 sent emails per day on a free account, which
  is far above this app's approval volume.
- If you later verify a custom domain and prefer Resend, the send step
  in `api/registrations.ts` is the only place that changes.
