// GET /api/auth/google — starts the custom Google OAuth flow.
//
// This is a Vercel Serverless Function (api/ is deployed by Vercel
// alongside the static Vite build; it is not part of the Express server
// in server.ts, which Vercel does not run).
//
// Flow:
//   1. User clicks "Continue with Google" in the app.
//   2. The app redirects here (via authService.loginWithGoogle()).
//   3. This function redirects the user to Google's consent screen.
//   4. Google redirects back to /api/auth/callback/google, which finishes
//      the sign-in and hands the profile back to the app.
//
// This file is deliberately self-contained: it imports nothing from
// api/_lib, uses no Node-only modules, and uses only plain Node
// writeHead/end responses. That way a bundling or runtime quirk in a
// shared helper cannot take the whole function down.
//
// The callback path here must match an Authorized redirect URI already
// registered in Google Cloud Console for this OAuth client:
//   https://locora-hyperlocal.vercel.app/api/auth/callback/google

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
      "Google sign-in is not configured on the server. " +
        "Set GOOGLE_CLIENT_ID in Vercel (Production) and redeploy.",
    );
  }

  // Role comes from the signup page's attendee/organizer choice. Anything
  // else falls back to attendee so a crafted URL cannot inject a role.
  const role = req.query?.role === "organizer" ? "organizer" : "attendee";

  // Only allow same-site return paths, never an external URL.
  const rawReturnTo =
    typeof req.query?.returnTo === "string" ? req.query.returnTo : "";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/dashboard";

  // CSRF protection: a random token is stored in an HttpOnly cookie and
  // echoed back inside `state`. The callback only proceeds if they match.
  const csrf = randomToken();
  const state = base64urlEncode(JSON.stringify({ csrf, role, returnTo }));

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
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });

  res.writeHead(302, {
    Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    "Set-Cookie": cookie,
  });
  return res.end();
}
