// Shared server helpers for Locora security fix — NO IMPORTS, NO node:crypto.
// This file is inlined into each api/*.ts function because this project's
// Vercel functions have historically been self-contained (no static imports:
// the previous _lib import and the node:crypto import both failed live with
// FUNCTION_INVOCATION_FAILED, while the import-free api/auth/google.ts worked).
// Crypto uses only WebCrypto (globalThis.crypto.subtle) + btoa/atob, which
// work in Node and Edge runtimes without any import. No secrets are hardcoded:
// SESSION_SECRET, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come only from
// Vercel env vars. If SESSION_SECRET is missing, session verification fails
// closed (null) and login/signup/Google callback must refuse to issue a session.
export const ADMIN_EMAILS = ["mr.adeen946@gmail.com", "ayan.work937@gmail.com"];

export function getEnv(name: string): string {
  try {
    const env = (globalThis as any).process?.env;
    return (env && env[name]) || "";
  } catch {
    return "";
  }
}

export function norm(email: string): string {
  return (email || "").trim().toLowerCase();
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^@\s@]+$/.test(s || "");
}

export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.indexOf(norm(email)) !== -1;
}

export function sendJson(res: any, status: number, obj: any, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
    ...(extraHeaders || {}),
  });
  res.end(JSON.stringify(obj));
}

export function parseCookies(req: any): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers?.cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function getClientIp(req: any): string {
  const fwd = req.headers?.["x-forwarded-for"] || "";
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  return req.headers?.["x-real-ip"] || "unknown";
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlEncode(text: string): string {
  return bytesToB64url(new TextEncoder().encode(text));
}
function b64urlDecode(text: string): string {
  return new TextDecoder().decode(b64urlToBytes(text));
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  (globalThis as any).crypto.getRandomValues(out);
  return out;
}
function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sha256Hex(text: string): Promise<string> {
  const digest = await (globalThis as any).crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}
async function hmacB64url(secret: string, data: string): Promise<string> {
  const key = await (globalThis as any).crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await (globalThis as any).crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

export interface SessionUser { email: string; role: string; authProvider: string; sessionVersion?: number; }

export async function signSession(email: string, role: string, authProvider: string, sessionVersion = 0): Promise<string> {
  const secret = getEnv("SESSION_SECRET");
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(JSON.stringify({
    email: norm(email), role: role || "attendee", authProvider: authProvider || "local",
    v: sessionVersion || 0, iat: now, exp: now + 7 * 24 * 3600,
  }));
  const sig = await hmacB64url(secret, header + "." + payload);
  return header + "." + payload + "." + sig;
}

export async function verifySession(req: any): Promise<SessionUser | null> {
  try {
    const secret = getEnv("SESSION_SECRET");
    if (!secret) return null;
    const token = parseCookies(req).locora_session;
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expected = await hmacB64url(secret, parts[0] + "." + parts[1]);
    if (!ctEqual(expected, parts[2])) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]));
    if (!payload.email || !isEmail(payload.email) || !payload.exp || payload.exp * 1000 < Date.now()) return null;
    const email = norm(payload.email);
    try {
      const tokenHash = await sha256Hex(token);
      const rev = await fetchJson(`${supabaseBase()}/rest/v1/revoked_tokens?id=eq.${encodeURIComponent(tokenHash)}&select=data`, { headers: supabaseHeaders() });
      if (rev.ok && Array.isArray(rev.body) && rev.body.length > 0) {
        const exp = rev.body[0].data?.expiresAt;
        if (!exp || new Date(exp).getTime() > Date.now()) return null;
      }
    } catch {}
    try {
      const userRow = await loadUserByEmail(email);
      if (userRow && userRow.data && typeof userRow.data.sessionVersion === "number") {
        const stored = userRow.data.sessionVersion;
        if (payload.v === undefined) {
          if (stored > 0) return null;
        } else if (payload.v !== stored) {
          return null;
        }
      }
    } catch {}
    return { email, role: payload.role || "attendee", authProvider: payload.authProvider || "local", sessionVersion: typeof payload.v === "number" ? payload.v : undefined };
  } catch {
    return null;
  }
}

export async function revokeSessionToken(req: any): Promise<boolean> {
  try {
    const token = parseCookies(req).locora_session;
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    let expIso = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    try { expIso = new Date(JSON.parse(b64urlDecode(parts[1])).exp * 1000).toISOString(); } catch {}
    const tokenHash = await sha256Hex(token);
    const { ok } = await fetchJson(`${supabaseBase()}/rest/v1/revoked_tokens`, {
      method: "POST",
      headers: { ...supabaseHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: tokenHash, data: { tokenHash, email: norm(JSON.parse(b64urlDecode(parts[1])).email || ""), expiresAt: expIso } }),
    });
    return ok;
  } catch { return false; }
}

function isSecureReq(req: any): boolean {
  const proto = req.headers?.["x-forwarded-proto"];
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "";
  return proto === "https" || (host !== "" && !host.includes("localhost") && !host.startsWith("127."));
}

export function sessionCookie(jwt: string, req: any): string {
  return `locora_session=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${isSecureReq(req) ? "; Secure" : ""}`;
}
export function clearSessionCookie(req: any): string {
  return `locora_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecureReq(req) ? "; Secure" : ""}`;
}

// ---- Supabase ----
export function supabaseHeaders(): Record<string, string> {
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}
export function supabaseBase(): string {
  return getEnv("SUPABASE_URL").replace(/\/$/, "");
}
export async function fetchJson(url: string, init?: any): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(url, init);
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  return { ok: res.ok, status: res.status, body };
}
export function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      const b = (req as any).body;
      if (b && typeof b === "object") return resolve(b);
      if (typeof b === "string" && b.length > 0) {
        try { return resolve(JSON.parse(b)); } catch { return resolve({}); }
      }
      let data = "";
      const timer = setTimeout(() => resolve({}), 3000);
      req.on("data", (chunk: any) => { data += chunk; });
      req.on("end", () => { clearTimeout(timer); try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
      req.on("error", () => { clearTimeout(timer); resolve({}); });
    } catch { resolve({}); }
  });
}

// ---- Passwords (PBKDF2-SHA256 via WebCrypto, per-user salt, constant-time compare) ----
// Format: pbkdf2$<saltHex>$<hashHex>$100000. No live passwords exist yet
// (locora_users table is new in this fix), so no scrypt migration is needed.
export async function hashPassword(password: string): Promise<string> {
  const salt = bytesToHex(randomBytes(16));
  const key = await (globalThis as any).crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await (globalThis as any).crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${salt}$${bytesToHex(new Uint8Array(bits))}$100000`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = (stored || "").split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const key = await (globalThis as any).crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await (globalThis as any).crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(parts[1]), iterations: parseInt(parts[3], 10) || 100000, hash: "SHA-256" }, key, 256);
    return ctEqual(bytesToHex(new Uint8Array(bits)), parts[2]);
  } catch { return false; }
}
export async function hashToken(raw: string): Promise<string> {
  return sha256Hex(raw);
}
export function randomTokenHex(bytes = 32): string {
  return bytesToHex(randomBytes(bytes));
}

// ---- Rate limiting (Supabase-backed counter, table rate_limits) ----
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfter: number; tableMissing: boolean }> {
  try {
    if (!supabaseBase() || !getEnv("SUPABASE_SERVICE_ROLE_KEY")) return { allowed: false, retryAfter: 0, tableMissing: true };
    const url = `${supabaseBase()}/rest/v1/rate_limits?id=eq.${encodeURIComponent(key)}&select=data`;
    const { ok, status, body } = await fetchJson(url, { headers: supabaseHeaders() });
    if (!ok) {
      if (status === 404 || status === 400) return { allowed: false, retryAfter: 0, tableMissing: true };
      return { allowed: true, retryAfter: 0, tableMissing: false };
    }
    const now = Date.now();
    const row = Array.isArray(body) && body.length > 0 ? body[0].data : null;
    const windowStart = row && typeof row.windowStart === "number" ? row.windowStart : 0;
    const count = row && typeof row.count === "number" ? row.count : 0;
    if (windowStart && now - windowStart < windowMs && count >= limit) {
      return { allowed: false, retryAfter: Math.ceil((windowStart + windowMs - now) / 1000), tableMissing: false };
    }
    const fresh = !windowStart || now - windowStart >= windowMs;
    const next = { count: fresh ? 1 : count + 1, windowStart: fresh ? now : windowStart };
    const up = await fetchJson(`${supabaseBase()}/rest/v1/rate_limits`, {
      method: "POST",
      headers: { ...supabaseHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: key, data: next }),
    });
    if (!up.ok && (up.status === 404 || up.status === 400)) return { allowed: false, retryAfter: 0, tableMissing: true };
    return { allowed: true, retryAfter: 0, tableMissing: false };
  } catch {
    return { allowed: true, retryAfter: 0, tableMissing: false };
  }
}

// ---- Events / organiser helpers ----
export function organizerEmailOf(event: any): string {
  return norm(event?.createdByEmail || event?.organizer?.email || "");
}
export function isEventOwner(event: any, email: string): boolean {
  if (!event || !email) return false;
  const e = norm(email);
  if (event.createdByEmail) return norm(event.createdByEmail) === e;
  return (event.organizer?.email || "") !== "" && norm(event.organizer.email) === e;
}
export function mayManageEvent(event: any, email: string): boolean {
  if (!event || !email) return false;
  if (isAdmin(email)) return true;
  return isEventOwner(event, email);
}
export function stripEventPublic(event: any): any {
  if (!event) return event;
  const { createdByEmail: _c, upiId: _u, organizer, ...rest } = event;
  let org = organizer;
  if (organizer && typeof organizer === "object") {
    const { email: _e, ...orgRest } = organizer;
    org = orgRest;
  }
  return { ...rest, organizer: org };
}
export async function loadEvent(eventId: string): Promise<any | null> {
  const { ok, body } = await fetchJson(
    `${supabaseBase()}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=data`,
    { headers: supabaseHeaders() },
  );
  if (!ok || !Array.isArray(body) || body.length === 0) return null;
  return body[0].data;
}
export async function loadAllEvents(): Promise<any[]> {
  const { ok, body } = await fetchJson(
    `${supabaseBase()}/rest/v1/events?select=data&order=created_at.desc&limit=1000`,
    { headers: supabaseHeaders() },
  );
  if (!ok || !Array.isArray(body)) return [];
  return body.map((r: any) => r.data).filter(Boolean);
}
export async function isApprovedOrganizer(email: string): Promise<boolean> {
  if (isAdmin(email)) return true;
  try {
    const { ok, body } = await fetchJson(
      `${supabaseBase()}/rest/v1/organizer_access?email=eq.${encodeURIComponent(norm(email))}&select=data`,
      { headers: supabaseHeaders() },
    );
    if (!ok || !Array.isArray(body) || body.length === 0) return false;
    return body[0].data?.status === "approved";
  } catch { return false; }
}
export async function loadUserByEmail(email: string): Promise<{ id: string; data: any } | null> {
  const { ok, body } = await fetchJson(
    `${supabaseBase()}/rest/v1/locora_users?select=id,data&data->>email=eq.${encodeURIComponent(norm(email))}`,
    { headers: supabaseHeaders() },
  );
  if (!ok || !Array.isArray(body) || body.length === 0) return null;
  return body[0];
}
export function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// SECURITY FIX — Phase 2 P2-2: after the existing Google ID-token
// verification, this callback now also issues a server session cookie
// (locora_session, HttpOnly, Secure, SameSite=Lax, 7 days) and records
// the Google user in locora_users (no password row for Google accounts).
// API identity comes from that cookie, never from localStorage.
// GET /api/auth/callback/google — finishes the custom Google OAuth flow.
//
// Google redirects here with ?code=...&state=... after the user consents.
// This function:
//   1. Verifies the `state` token against the HttpOnly cookie set by
//      /api/auth/google (CSRF protection).
//   2. Exchanges the code for tokens, server-to-server, using
//      GOOGLE_CLIENT_SECRET (never exposed to the browser).
//   3. Verifies the ID token's audience via Google's tokeninfo endpoint.
//   4. Fetches the user's profile and hands it back to the single-page
//      app, which stores it in localStorage exactly like the previous
//      Firebase Google sign-in did (keys: locora_current_user,
//      locora_auth_token), then redirects to /dashboard (or the
//      returnTo path encoded in `state`).
//
// If anything fails, this returns a plain HTML page explaining the most
// likely cause instead of a blank screen or a raw JSON error.
//
// Calendar connect branch: /api/auth/google-calendar starts a flow with
// the same redirect URI but state.purpose === "calendar". After the same
// code exchange and ID-token verification as sign-in, this callback does
// NOT sign anyone in: it stores the (encrypted) refresh token in Supabase
// under the Locora user id from state, then sends the user back to
// state.returnTo. See CALENDAR_SETUP.md for the table + console steps.

// Self-contained: no imports from api/_lib, no Node-only modules.
// The callback path must match an Authorized redirect URI registered in
// Google Cloud Console: https://locora-hyperlocal.vercel.app/api/auth/callback/google


function base64urlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function decodeState(value: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(base64urlDecode(value));
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

// --- Google Calendar storage helpers (used only by the calendar branch) ---
// The refresh token is encrypted with AES-GCM before it is stored. The
// key is derived from GOOGLE_CLIENT_SECRET, which never leaves the
// server, so a database read alone never yields a usable token. Only the
// refresh token is stored long-term; access tokens are minted on demand
// from it and never persisted.
function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptRefreshToken(refreshToken: string): Promise<string> {
  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is unavailable in this runtime");
  const secret = getEnv("GOOGLE_CLIENT_SECRET");
  const keyMaterial = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode("locora-calendar-v1:" + secret),
  );
  const key = await subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["encrypt"]);
  const iv = new Uint8Array(12);
  (globalThis as any).crypto.getRandomValues(iv);
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(refreshToken),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return base64EncodeBytes(combined);
}

function calendarSupabaseHeaders(): Record<string, string> {
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates",
  };
}


function htmlPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; color: #1E2320;">
${bodyHtml}
</body>
</html>`;
}

function escapeForScript(json: string): string {
  return json.replace(/</g, "\u003c").replace(/>/g, "\u003e");
}

function sendText(res: any, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function getRedirectUri(req: any): string {
  const configured = getEnv("GOOGLE_REDIRECT_URI");
  if (configured) return configured;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "";
  return `${proto}://${host}/api/auth/callback/google`;
}

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80";

function errorPage(res: any, status: number, heading: string, detail: string) {
  return sendText(
    res,
    status,
    htmlPage(
      heading,
      `<h1>${heading}</h1><p>${detail}</p><p><a href="/login">Back to sign in</a></p>`,
    ),
    "text/html; charset=utf-8",
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendText(res, 405, "Method not allowed");
  }

  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return errorPage(
      res,
      500,
      "Google sign-in is not configured",
      "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing on the server. " +
        "Set both in Vercel (Production, sensitive) and redeploy. " +
        "Do not put the secret in code or in a VITE_ variable.",
    );
  }

  // Google sends ?error=access_denied when the user cancels.
  if (typeof req.query?.error === "string") {
    return errorPage(
      res,
      400,
      "Google sign-in was not completed",
      "Google returned an error for this sign-in attempt. " +
        "Please try again from the sign-in page, and make sure you allow the consent screen to complete.",
    );
  }

  const code = req.query?.code;
  const stateRaw = req.query?.state;
  if (typeof code !== "string" || typeof stateRaw !== "string") {
    return errorPage(
      res,
      400,
      "Invalid sign-in response",
      "Google did not return a sign-in code. Please start again from the sign-in page.",
    );
  }

  const state = decodeState(stateRaw);
  const cookies = parseCookies(req);
  if (!state || !state.csrf || cookies.locora_oauth_state !== state.csrf) {
    return errorPage(
      res,
      400,
      "Sign-in request expired or invalid",
      "The sign-in request could not be verified (state mismatch). " +
        "This can happen if cookies are blocked or the request expired. " +
        "Please try again from the sign-in page.",
    );
  }

  // Roles are NOT taken from the sign-in request anymore. A role chosen by
  // the visitor at sign-in used to let anyone become an organizer. Now the
  // role is assigned below, from the Google-verified email, after the
  // profile is fetched: admin emails become admins, everyone else becomes
  // an attendee. Organizer status comes only from an admin approval
  // (see api/organizer-access.ts), never from sign-in.
  const returnTo =
    state.returnTo && state.returnTo.startsWith("/") && !state.returnTo.startsWith("//")
      ? state.returnTo
      : "/dashboard";
  const redirectUri = getRedirectUri(req);

  // 1. Exchange the authorisation code for tokens.
  let tokenData: any;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token || !tokenData.id_token) {
      const detail = tokenData?.error_description || tokenData?.error || "Unknown token error";
      return errorPage(
        res,
        400,
        "Google sign-in failed while exchanging the code",
        `Google said: ${detail}. ` +
          `Most often this is a redirect URI mismatch: make sure ` +
          `${redirectUri} is registered exactly as an Authorized redirect URI ` +
          `in Google Cloud Console for this OAuth client, and that ` +
          `GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Vercel belong to that same client, then redeploy.`,
      );
    }
  } catch {
    return errorPage(
      res,
      502,
      "Could not reach Google",
      "The token exchange failed due to a network error. Please try again.",
    );
  }

  // 2. Verify the ID token belongs to this OAuth client.
  try {
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`,
    );
    const info = await infoRes.json();
    if (!infoRes.ok || info.aud !== clientId) {
      return errorPage(
        res,
        400,
        "Google sign-in could not be verified",
        "The ID token returned by Google did not match this OAuth client. " +
          "Check that GOOGLE_CLIENT_ID in Vercel matches the client used to start the sign-in.",
      );
    }
  } catch {
    return errorPage(
      res,
      502,
      "Could not verify the Google sign-in",
      "Token verification failed due to a network error. Please try again.",
    );
  }

  // Calendar connect branch: same exchange + ID-token verification as
  // sign-in above, but no sign-in happens here. Store the refresh token
  // and send the user back to where they started.
  if (state.purpose === "calendar") {
    const calendarUserId =
      typeof state.userId === "string" ? state.userId : "";
    if (!calendarUserId || calendarUserId.length > 128) {
      return errorPage(
        res,
        400,
        "Google Calendar connection failed",
        "The connection request did not carry a valid user. Please connect again from your profile page while signed in.",
      );
    }
    if (!tokenData.refresh_token) {
      return errorPage(
        res,
        400,
        "Google Calendar connection incomplete",
        "Google did not return a long-term connection token. This can happen " +
          "if access was already granted without offline access. Remove Locora " +
          "from your Google Account permissions (myaccount.google.com/permissions) " +
          "and connect again from your profile page.",
      );
    }
    // The Google account that consented — shown back in the profile page.
    let calendarEmail = "";
    try {
      const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        const info = await userRes.json();
        calendarEmail = typeof info.email === "string" ? info.email : "";
      }
    } catch {
      calendarEmail = "";
    }
    if (!calendarEmail) {
      try {
        calendarEmail = JSON.parse(base64urlDecode(tokenData.id_token.split(".")[1])).email || "";
      } catch {
        calendarEmail = "";
      }
    }
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return errorPage(
        res,
        500,
        "Google Calendar storage is not configured",
        "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on the server, " +
          "or the calendar_connections table has not been created yet. " +
          "See CALENDAR_SETUP.md, then try connecting again.",
      );
    }
    let encrypted: string;
    try {
      encrypted = await encryptRefreshToken(tokenData.refresh_token);
    } catch {
      return errorPage(
        res,
        502,
        "Google Calendar connection failed",
        "The connection token could not be secured for storage. Please try again.",
      );
    }
    try {
      const upsertRes = await fetch(
        supabaseUrl.replace(/\/$/, "") + "/rest/v1/calendar_connections",
        {
          method: "POST",
          headers: calendarSupabaseHeaders(),
          body: JSON.stringify([
            {
              user_id: calendarUserId,
              data: {
                refresh_token_enc: encrypted,
                google_email: calendarEmail,
                scope: "calendar.events",
                connected_at: new Date().toISOString(),
              },
            },
          ]),
        },
      );
      if (!upsertRes.ok) {
        const detail = await upsertRes.text().catch(() => "");
        return errorPage(
          res,
          502,
          "Google Calendar connection could not be saved",
          "The connection token could not be stored. " +
            "Make sure the calendar_connections table exists in Supabase (see CALENDAR_SETUP.md). " +
            (detail ? `Server said: ${detail.slice(0, 200)}` : ""),
        );
      }
    } catch {
      return errorPage(
        res,
        502,
        "Google Calendar connection could not be saved",
        "The connection token could not be stored due to a network error. Please try again.",
      );
    }
    const secureCal = redirectUri.startsWith("https://") ? "; Secure" : "";
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": `locora_oauth_state=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secureCal}`,
    });
    return res.end(
      htmlPage(
        "Google Calendar connected",
        `<p id="status">Google Calendar connected${calendarEmail ? ` as ${calendarEmail}` : ""} — taking you back…</p>
        <p>Events you register for will now be added to your Google Calendar automatically.</p>
        <script>
          setTimeout(function () {
            window.location.replace(${escapeForScript(JSON.stringify(returnTo))});
          }, 900);
        </script>
        <noscript><p><a href="${returnTo}">Continue</a></p></noscript>`,
      ),
    );
  }

  // 3. Fetch the user's profile.
  let googleUser: any = null;
  try {
    const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userRes.ok) googleUser = await userRes.json();
  } catch {
    googleUser = null;
  }
  if (!googleUser) {
    // Fallback: the ID token payload itself carries sub/name/email/picture.
    try {
      const payload = tokenData.id_token.split(".")[1];
      const decoded = JSON.parse(base64urlDecode(payload));
      googleUser = decoded;
    } catch {
      return errorPage(
        res,
        502,
        "Could not load your Google profile",
        "Google authenticated you, but the profile could not be loaded. Please try again.",
      );
    }
  }

  if (!googleUser.email) {
    return errorPage(
      res,
      400,
      "Google account has no email address",
      "This Google account did not provide an email address, so an account cannot be created. Please try a different Google account.",
    );
  }

  // Admin emails are identifiers, not secrets. This email comes from
  // Google's own userinfo response for the just-exchanged token, so it is
  // verified by Google, not self-asserted by the visitor.
  const ADMIN_EMAILS = ["mr.adeen946@gmail.com", "ayan.work937@gmail.com"];
  const profile = {
    id: googleUser.sub,
    name: googleUser.name || "Community Member",
    email: googleUser.email,
    avatar: googleUser.picture || FALLBACK_AVATAR,
    bio: "Active Locora community member.",
    // No home neighborhood by default: the location rule derives it
    // from a saved state/city, and new accounts have none yet.
    neighborhood: "",
    interests: ["Food & Community", "Live Music & Culture"],
    role:
      ADMIN_EMAILS.indexOf(String(googleUser.email).trim().toLowerCase()) !== -1
        ? "admin"
        : "attendee",
    authProvider: "google",
    createdAt: new Date().toISOString(),
  };

  // 4. SECURITY FIX: issue a server session, then hand the profile
  //    back to the SPA in the same localStorage shape the app uses.
  //    The cookie is authoritative for the API; localStorage is UI only.
  //    The stored sessionVersion (0 for a new user) is baked into the
  //    token so a later password reset / version bump kills old tokens.
  //    Record the Google user server-side (no password row). Best-effort:
  //    a missing locora_users table must not break Google sign-in, but the
  //    session cookie above is still required for every API call.
  let existingGoogleUser: any = null;
  try { existingGoogleUser = await loadUserByEmail(profile.email); } catch {}
  const googleSessionVersion = existingGoogleUser && typeof existingGoogleUser.data?.sessionVersion === "number" ? existingGoogleUser.data.sessionVersion : 0;
  let jwt = "";
  try {
    jwt = await signSession(profile.email, profile.role, "google", googleSessionVersion);
  } catch {
    return errorPage(
      res,
      500,
      "Sign-in is not configured",
      "SESSION_SECRET is missing on the server. Set it in Vercel (Production, sensitive) and redeploy.",
    );
  }
  try {
    if (!existingGoogleUser) {
      await fetchJson(`${supabaseBase()}/rest/v1/locora_users`, {
        method: "POST", headers: supabaseHeaders(),
        body: JSON.stringify({ id: profile.id, data: { email: norm(profile.email), name: profile.name, role: profile.role, authProvider: "google", sessionVersion: 0, createdAt: profile.createdAt } }),
      });
    }
  } catch {}
  const profileJson = escapeForScript(JSON.stringify(profile));
  const tokenJson = escapeForScript(JSON.stringify(tokenData.id_token));
  const secure = redirectUri.startsWith("https://") ? "; Secure" : "";
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Set-Cookie": [
      `locora_oauth_state=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
      sessionCookie(jwt, req),
    ],
  });
  return res.end(
    htmlPage(
      "Signing you in…",
      `<p id="status">Signing you in…</p>
      <script>
        var profile = ${profileJson};
        try {
          var prev = null;
          try { prev = JSON.parse(localStorage.getItem('locora_saved_profile_' + String(profile.email).toLowerCase()) || 'null'); } catch (e) { prev = null; }
          if (prev && typeof prev === 'object') {
            if (prev.phone !== undefined) profile.phone = prev.phone;
            if (prev.phoneVerified !== undefined) profile.phoneVerified = prev.phoneVerified;
            if (prev.bio !== undefined) profile.bio = prev.bio;
            if (prev.country !== undefined) profile.country = prev.country;
            if (prev.state !== undefined) profile.state = prev.state;
            if (prev.city !== undefined) profile.city = prev.city;
            if (Array.isArray(prev.interests)) profile.interests = prev.interests;
          }
        } catch (e) {}
        var saved = false;
        try {
          localStorage.setItem('locora_current_user', JSON.stringify(profile));
          localStorage.setItem('locora_auth_token', ${tokenJson});
          saved = localStorage.getItem('locora_current_user') !== null;
        } catch (e) { saved = false; }
        var status = document.getElementById('status');
        if (saved) {
          status.textContent = 'Signed in as ' + (profile.name || 'you') + ' — taking you to your dashboard…';
          try {
            var notifyBody = function (a) { return JSON.stringify({ action: a, email: profile.email, name: profile.name }); };
            fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: notifyBody('login'), keepalive: true }).catch(function () {});
            fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: notifyBody('welcome'), keepalive: true }).catch(function () {});
          } catch (e) {}
          setTimeout(function () {
            window.location.replace(${escapeForScript(JSON.stringify(returnTo))});
          }, 900);
        } else {
          status.textContent = 'Could not save your sign-in in this browser (site storage appears blocked). Please allow storage for this site and try again.';
        }
      </script>
      <noscript><p>JavaScript is required to complete sign-in. <a href="/login">Back to sign in</a></p></noscript>`,
    ),
  );
}
