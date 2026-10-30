// Shared helpers for the Vercel Serverless Functions under api/auth/*.
//
// Security notes:
// - No secrets are hardcoded here. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
//   must come from server environment variables only (Vercel > Settings >
//   Environment Variables). Never prefix them with VITE_ and never commit
//   real values to the repository.
// - The client secret is only ever sent server-to-server to Google's token
//   endpoint. It is never returned to the browser.
// - `process` and `Buffer` are declared as `any` here because this repo's
//   tsconfig only includes vite/client types, so `tsc --noEmit` would
//   otherwise complain. Both are available in the Vercel Node runtime.

import { randomBytes } from "crypto";

declare const process: any;
declare const Buffer: any;

export function getClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || "";
}

export function getClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || "";
}

// The redirect URI Google must send the user back to. If
// GOOGLE_REDIRECT_URI is set, it wins (use it for production). Otherwise it
// is derived from the incoming request host, so preview deployments work
// as long as their callback URL is also registered in Google Cloud Console.
export function getRedirectUri(req: any): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) return configured;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "";
  return `${proto}://${host}/api/auth/google/callback`;
}

export function isHttpsRedirect(req: any): boolean {
  return getRedirectUri(req).startsWith("https://");
}

export function randomToken(): string {
  return randomBytes(16).toString("hex");
}

export function encodeState(obj: Record<string, string>): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

export function decodeState(value: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function parseCookies(req: any): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers?.cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(
        part.slice(idx + 1).trim(),
      );
    }
  }
  return out;
}

export function stateCookieHeader(csrf: string, req: any): string {
  const secure = isHttpsRedirect(req) ? "; Secure" : "";
  return `locora_oauth_state=${csrf}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export function clearStateCookieHeader(req: any): string {
  const secure = isHttpsRedirect(req) ? "; Secure" : "";
  return `locora_oauth_state=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

// Small HTML page used for errors and for handing the signed-in profile
// back to the single-page app. The profile JSON is escaped so a name
// containing "</script>" cannot break out of the script tag.
export function htmlPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; color: #1E2320;">
${bodyHtml}
</body>
</html>`;
}

export function escapeForScript(json: string): string {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

// Plain Node response helpers.
//
// Vercel's Node runtime is a plain http.ServerResponse in some setups,
// so Express-style res.status().send() / res.redirect() cannot be relied
// on here. These helpers use only writeHead/end, which always exist.
export function sendText(res: any, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

export function redirectTo(res: any, location: string, cookie?: string): void {
  const headers: Record<string, string> = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(302, headers);
  res.end();
}
