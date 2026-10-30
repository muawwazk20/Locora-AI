// GET /api/auth/google-calendar — starts the Google Calendar connect flow.
//
// This reuses the SAME Google OAuth client and the SAME Authorized
// redirect URI as sign-in (/api/auth/callback/google), so no new redirect
// URI has to be registered in Google Cloud Console. The difference from
// sign-in is in the consent requested here:
//   scope: openid email profile + calendar.events
//   access_type: offline (Google returns a refresh token)
//   prompt: consent (forces a fresh refresh token on every connect, so a
//           reconnect reliably replaces a revoked/expired one)
//
// The shared sign-in callback branches on state.purpose === "calendar":
// instead of signing the user in, it stores the (encrypted) refresh token
// in Supabase keyed by the Locora user id, then sends the user back to
// `returnTo`. No calendar data is ever read; Locora only inserts events
// the user registers for, and deletes the event it created if asked.
//
// Self-contained, same pattern as api/auth/google.ts. Requires the
// Calendar API to be enabled for this OAuth client in Google Cloud
// Console and the calendar.events scope to be added to the consent
// screen (see CALENDAR_SETUP.md). No new Vercel env vars are needed:
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are reused.

function getEnv(name: string): string {
  try {
    const env = (globalThis as any).process?.env;
    return (env && env[name]) || "";
  } catch {
    return "";
  }
}

function base64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  (globalThis as any).crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Method not allowed");
  }

  const clientId = getEnv("GOOGLE_CLIENT_ID");
  if (!clientId) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end(
      "Google Calendar connect is not configured on the server. " +
        "Set GOOGLE_CLIENT_ID in Vercel (Production) and redeploy.",
    );
  }

  // The Locora user id comes from the signed-in session in the browser
  // (authService.getCurrentUser().id). It is only used as the storage key
  // for that user's own calendar connection — never to impersonate
  // anyone else, since Google still asks THAT Google account to consent.
  const userId = typeof req.query?.userId === "string" ? req.query.userId : "";
  if (!userId || userId.length > 128) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Missing or invalid userId. Connect from your profile page while signed in.");
  }

  // Only allow same-site return paths, never an external URL.
  const rawReturnTo =
    typeof req.query?.returnTo === "string" ? req.query.returnTo : "";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/profile";

  // CSRF protection: same pattern as sign-in — a random token in an
  // HttpOnly cookie, echoed back inside `state`.
  const csrf = randomToken();
  const state = base64urlEncode(
    JSON.stringify({ csrf, purpose: "calendar", userId, returnTo }),
  );

  const configured = getEnv("GOOGLE_REDIRECT_URI");
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "";
  const redirectUri = configured || `${proto}://${host}/api/auth/callback/google`;

  const secure = redirectUri.startsWith("https://") ? "; Secure" : "";
  const cookie = `locora_oauth_state=${csrf}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  res.writeHead(302, {
    Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    "Set-Cookie": cookie,
  });
  return res.end();
}
