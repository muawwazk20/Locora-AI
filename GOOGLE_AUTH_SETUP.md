# Google Sign-In / Sign-Up — Custom OAuth Setup

Locora now uses a custom, server-side Google OAuth flow for the
"Continue with Google" buttons on `/login` and `/signup`.

Firebase Auth has been removed entirely from this repo: `src/lib/firebase.ts`,
`firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.rules`,
and the `firebase` / `firebase-admin` dependencies are gone, and no code
imports Firebase any more. Google is now the only third-party auth provider
in the live app. The email/password forms are unchanged — they use the
app's own Express `/api/auth/*` routes (locally) / demo mode, not Firebase.
If you ever need the deleted Firebase files back, they are still in
`main`'s history.

The old "Google OAuth Setup" dialog has also been removed. That dialog
appeared whenever the browser bundle did not contain a Client ID, and it
asked every visitor to paste a Client ID — something visitors do not have
and should never be asked for. With this flow, visitors just click
"Continue with Google" and are redirected to Google; no Client ID is
needed in the browser at all. The Client ID and Secret live only in
Vercel environment variables, used server-side by `api/auth/*`.

## How it works

1. The user clicks **Continue with Google**.
2. `authService.loginWithGoogle()` redirects the browser to
   `/api/auth/google` (a Vercel Serverless Function in `api/auth/google.ts`).
3. That function redirects to Google's consent screen, with a random
   `state` token stored in an HttpOnly cookie (CSRF protection).
4. Google redirects back to `/api/auth/callback/google`
   (`api/auth/google/callback.ts`), which:
   - verifies `state` against the cookie,
   - exchanges the code for tokens server-to-server using
     `GOOGLE_CLIENT_SECRET` (the secret never reaches the browser),
   - verifies the ID token's audience with Google's tokeninfo endpoint,
   - fetches the user's profile and stores it in `localStorage`
     (`locora_current_user`, `locora_auth_token`) exactly like the app
     already did, then redirects to `/dashboard`.
5. On signup, the attendee/organizer choice is carried through `state`,
   so a Google signup respects the role selected on the form.

## 1. Vercel environment variables (already added — verify these)

In Vercel Dashboard > Project > Settings > Environment Variables, set
these for **Production** (type: **Sensitive** for the secret), then
**redeploy** — environment variables only take effect after a new
deployment:

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` *(optional)* | `https://locora-hyperlocal.vercel.app/api/auth/callback/google` |

If `GOOGLE_REDIRECT_URI` is unset, the callback URL is derived from the
request host, so it will be `https://locora-hyperlocal.vercel.app/api/auth/callback/google`
in production. Never prefix these with `VITE_` — that would ship them to
the browser. Never commit real values to the repo.

## 2. Google Cloud Console (required — this is the step most people miss)

In Google Cloud Console > APIs & Services > Credentials, open your OAuth
2.0 Client ID and set:

- **Authorized JavaScript origins:**
  - `https://locora-hyperlocal.vercel.app`
- **Authorized redirect URIs:**
  - `https://locora-hyperlocal.vercel.app/api/auth/callback/google`

Both must match exactly — no trailing slash, `https` (not `http`).
If either is missing or different, Google will refuse the sign-in.

For local testing, also add `http://localhost:5173` as an origin and
`http://localhost:5173/api/auth/callback/google` as a redirect URI, and
run the project with `vercel dev` (the Express server in `server.ts` does
not serve `/api/auth/*`; those routes only exist as Vercel functions).

## 3. Deploy and test

1. Merge the Google OAuth pull request into `main` (Vercel auto-deploys
   `main` to `https://locora-hyperlocal.vercel.app`).
2. Confirm the deployment finished, then open
   `https://locora-hyperlocal.vercel.app/login`.
3. Click **Sign In with Google**, pick an account, allow the consent
   screen. You should land on `/dashboard` signed in as that Google
   account. Repeat from `/signup` to test signup (including the
   organizer role).

## Troubleshooting

| What you see | Most likely cause / fix |
| --- | --- |
| `redirect_uri_mismatch` from Google | The callback URL in step 2 does not exactly match the URL the app uses. Copy it from the error page / from `GOOGLE_REDIRECT_URI` and register that exact URL. |
| `invalid_client` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel do not belong to the same OAuth client as the one in Google Cloud Console, or the deployment is stale. Fix the values and redeploy. |
| "Google sign-in is not configured" | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing in Vercel Production. Add it and redeploy. |
| "Sign-in request expired or invalid" | Cookies blocked, or the sign-in was started long ago. Allow cookies for the site and try again. |
| Google sign-in works locally but not on Vercel | The Vercel domain was not added as an authorized origin / redirect URI (step 2), or the production deployment predates the env vars. |
| Preview deployments fail | A preview URL (e.g. `*.vercel.app` preview) is a different host, so its callback URL must also be registered in Google Cloud Console, or test on the production domain instead. |

## Security notes / known limits

- The client secret is only used server-to-server in the callback
  function. It is never in client code, never in a `VITE_` variable,
  and never in this repo.
- The callback verifies the ID token audience before creating a
  session, and the `state` cookie prevents CSRF.
- The app's existing model stores the user profile and Google ID token
  in `localStorage` and its `/api` routes do not yet verify that token
  on every request. That is unchanged from before this change. If you
  later protect backend routes, verify the ID token (or a server
  session) on the server — do not trust `localStorage` alone.
