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

// SECURITY FIX — session-gated: identity is the locora_session JWT.
// GET ?email=, POST request ?email, and POST approve/reject/revoke
// ?adminEmail are all IGNORED as identity; the session email is used.
// Admin lists and decisions require a session admin.

// Organizer access API — who may post events, and admin approval.
//
// GET  /api/organizer-access?email=x
//   -> { email, role: 'admin' | 'organizer' | 'pending' | 'attendee',
//        status: 'admin' | 'approved' | 'pending' | 'rejected' | 'none' }
// POST /api/organizer-access { action: 'request', email, name }
//   -> creates (or keeps) a pending organizer request for that email.
// POST /api/organizer-access { action: 'approve' | 'reject',
//                               adminEmail, targetEmail }
//   -> admin-only. Sets the target's status to approved/rejected.
// POST /api/organizer-access { action: 'revoke',
//                               adminEmail, targetEmail }
//   -> admin-only. Removes an approved organizer: the target's status
//     becomes 'revoked' and they go back to being an attendee. They may
//     request access again afterwards.
// GET  /api/organizer-access?pending=1&adminEmail=x
//   -> admin-only. Lists pending requests.
// GET  /api/organizer-access?organizers=1&adminEmail=x
//   -> admin-only. Lists approved organizers (for the remove list).
//
// This is a Vercel Serverless Function, self-contained (no imports).
// Access rows live in Supabase, not in any one browser's localStorage, so
// an approval made by an admin on one device applies to the requester on
// any device.
//
// Supabase setup (see ORGANIZER_ACCESS_SETUP.md):
//   Table: organizer_access (email text primary key, data jsonb not null,
//                            created_at timestamptz default now())
//   Vercel env vars (Production, Sensitive, already set for events):
//     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// The service-role key is server-only: the frontend never calls Supabase
// directly, it only calls this function, so the key never reaches a browser.
//
// Admins are identified by email only. These are identifiers, not secrets,
// and the check runs here on the server, not just in the browser. Never put
// a password in this file.
//   Admin emails: mr.adeen946@gmail.com, ayan.work937@gmail.com
//
// If the env vars are missing, this returns 503 JSON. The frontend treats
// any API failure as "access not verified" and fails closed: nobody is
// treated as an approved organizer from local data alone, except an admin
// signed in with Google (see OrganizerGuard).


async function fetchRow(email: string): Promise<any | null> {
  const url =
    supabaseBase() +
    "/rest/v1/organizer_access?email=eq." +
    encodeURIComponent(email) +
    "&select=email,data";
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) {
    const err: any = new Error("Supabase query failed: " + res.status);
    err.status = res.status;
    throw err;
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function upsertRow(email: string, data: any): Promise<void> {
  const url = supabaseBase() + "/rest/v1/organizer_access";
  const res = await fetch(url, {
    method: "POST",
    headers: Object.assign({}, supabaseHeaders(), {
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify({ email: email, data: data }),
  });
  if (!res.ok) {
    const err: any = new Error("Supabase upsert failed: " + res.status);
    err.status = res.status;
    throw err;
  }
}

function roleFor(email: string, row: any): any {
  if (isAdmin(email)) {
    return { email: email, role: "admin", status: "admin" };
  }
  if (!row) {
    return { email: email, role: "attendee", status: "none" };
  }
  const status = row.data && row.data.status;
  if (status === "approved") {
    return { email: email, role: "organizer", status: "approved" };
  }
  if (status === "pending") {
    return { email: email, role: "pending", status: "pending" };
  }
  return { email: email, role: "attendee", status: status || "none" };
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (!getEnv("SUPABASE_URL") || !getEnv("SUPABASE_SERVICE_ROLE_KEY")) {
      sendJson(res, 503, {
        message:
          "Shared organizer access is not configured. See ORGANIZER_ACCESS_SETUP.md.",
      });
      return;
    }

    const session = await verifySession(req);
    if (!session) { sendJson(res, 401, { message: "Sign in required" }); return; }
    const url = new URL(req.url || "/api/organizer-access", "http://localhost");
    const email = session.email;

    if (
      req.method === "GET" &&
      (url.searchParams.get("pending") === "1" ||
        url.searchParams.get("organizers") === "1")
    ) {
      const adminEmail = session.email;
      if (!isAdmin(adminEmail)) {
        sendJson(res, 403, { message: "Only admins can list organizer requests." });
        return;
      }
      const listUrl =
        supabaseBase() +
        "/rest/v1/organizer_access?select=email,data&order=created_at.asc";
      const listRes = await fetch(listUrl, { headers: supabaseHeaders() });
      if (!listRes.ok) {
        if (listRes.status === 404 || (listRes as any).status === 400) {
          // Table may not exist yet; surface the setup message distinctly.
          sendJson(res, 503, {
            message:
              "organizer_access table has not been created yet in Supabase. See ORGANIZER_ACCESS_SETUP.md step 2.",
          });
          return;
        }
        throw new Error("Supabase list failed: " + listRes.status);
      }
      const rows = await listRes.json();
      if (url.searchParams.get("organizers") === "1") {
        const organizers = (Array.isArray(rows) ? rows : [])
          .filter((r: any) => r.data && r.data.status === "approved")
          .map((r: any) => ({
            email: r.email,
            name: r.data.name || "",
            approvedAt: r.data.decidedAt || r.created_at || "",
          }));
        sendJson(res, 200, { organizers: organizers });
        return;
      }
      const pending = (Array.isArray(rows) ? rows : [])
        .filter((r: any) => r.data && r.data.status === "pending")
        .map((r: any) => ({
          email: r.email,
          name: r.data.name || "",
          requestedAt: r.data.requestedAt || r.created_at || "",
        }));
      sendJson(res, 200, { pending: pending });
      return;
    }

    if (req.method === "GET") {
      // email is the session email; the query param is ignored.
      let row: any = null;
      try {
        row = await fetchRow(email);
      } catch (e: any) {
        if (e && (e.status === 404 || e.status === 400)) {
          // Table missing: admins still resolve as admins; everyone else
          // resolves as attendee so the app fails closed, not broken.
          sendJson(res, 200, roleFor(email, null));
          return;
        }
        throw e;
      }
      sendJson(res, 200, roleFor(email, row));
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const action = body.action;

      if (action === "request") {
        const reqEmail = session.email;
        if (isAdmin(reqEmail)) {
          sendJson(res, 200, roleFor(reqEmail, null));
          return;
        }
        let row: any = null;
        try {
          row = await fetchRow(reqEmail);
        } catch (e: any) {
          if (e && (e.status === 404 || e.status === 400)) {
            sendJson(res, 503, {
              message:
                "organizer_access table has not been created yet in Supabase. See ORGANIZER_ACCESS_SETUP.md step 2.",
            });
            return;
          }
          throw e;
        }
        if (row && row.data && row.data.status === "approved") {
          sendJson(res, 200, roleFor(reqEmail, row));
          return;
        }
        const now = new Date().toISOString();
        await upsertRow(reqEmail, {
          status: "pending",
          name: body.name || "",
          requestedAt: (row && row.data && row.data.requestedAt) || now,
        });
        sendJson(res, 200, {
          email: reqEmail,
          role: "pending",
          status: "pending",
        });
        return;
      }

      if (action === "approve" || action === "reject" || action === "revoke") {
        const adminEmail = session.email;
        const targetEmail = norm(body.targetEmail || "");
        if (!isAdmin(adminEmail)) {
          sendJson(res, 403, {
            message: "Only admins can approve, reject, or remove organizers.",
          });
          return;
        }
        if (!targetEmail || isAdmin(targetEmail)) {
          sendJson(res, 400, { message: "Invalid target email." });
          return;
        }
        const status =
          action === "approve"
            ? "approved"
            : action === "revoke"
              ? "revoked"
              : "rejected";
        await upsertRow(targetEmail, {
          status: status,
          decidedBy: adminEmail,
          decidedAt: new Date().toISOString(),
        });
        sendJson(res, 200, {
          email: targetEmail,
          role: action === "approve" ? "organizer" : "attendee",
          status: status,
        });
        return;
      }

      sendJson(res, 400, { message: "Unknown action." });
      return;
    }

    sendJson(res, 405, { message: "Method not allowed." });
  } catch (e: any) {
    console.error("organizer-access failed:", e);
    sendJson(res, 502, { message: "Could not check organizer access." });
  }
}
