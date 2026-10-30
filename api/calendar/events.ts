// POST /api/calendar/events — add a shared Locora event to the user's
// own Google Calendar. DELETE removes an event this integration created.
//
// Body (POST): { userId, eventId }
// Query (DELETE): ?userId=...&calendarEventId=...
//
// Flow: look up the user's encrypted refresh token in Supabase
// (calendar_connections), mint a fresh access token from it, fetch the
// event from the shared events table, and insert it into the user's
// primary calendar. Locora never lists or reads the user's other
// calendar events — it only inserts the events the user registers for
// and deletes the ones it created.
//
// Self-contained Vercel Serverless Function (same pattern as
// api/events.ts). If no connection exists, POST returns
// { connected: false } (HTTP 200) instead of an error, so the frontend
// can offer the Connect button. If Google rejects the refresh token
// (user revoked access), the stored connection is deleted and the same
// { connected: false, revoked: true } shape is returned.

function getEnv(name: string): string {
  try {
    const env = (globalThis as any).process?.env;
    return (env && env[name]) || "";
  } catch {
    return "";
  }
}

function sendJson(res: any, status: number, obj: any): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function supabaseHeaders(): Record<string, string> {
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
}

function supabaseBase(): string {
  return getEnv("SUPABASE_URL").replace(/\/$/, "");
}

function firstQuery(query: any, name: string): string {
  const v = query ? query[name] : undefined;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return typeof v === "string" ? v : "";
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      const b = req.body;
      if (b && typeof b === "object") return resolve(b);
      if (typeof b === "string" && b.length > 0) {
        try {
          return resolve(JSON.parse(b));
        } catch {
          return resolve({});
        }
      }
      let data = "";
      const timer = setTimeout(() => resolve({}), 3000);
      req.on("data", (chunk: any) => {
        data += chunk;
      });
      req.on("end", () => {
        clearTimeout(timer);
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", () => {
        clearTimeout(timer);
        resolve({});
      });
    } catch {
      resolve({});
    }
  });
}

function base64urlDecodeToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decryptRefreshToken(encrypted: string): Promise<string> {
  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is unavailable in this runtime");
  const secret = getEnv("GOOGLE_CLIENT_SECRET");
  const keyMaterial = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode("locora-calendar-v1:" + secret),
  );
  const key = await subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["decrypt"]);
  const combined = base64urlDecodeToBytes(encrypted);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function fetchConnection(userId: string): Promise<any | null> {
  const rowRes = await fetch(
    supabaseBase() +
      "/rest/v1/calendar_connections?select=data&user_id=eq." +
      encodeURIComponent(userId),
    { headers: supabaseHeaders() },
  );
  const rows = await rowRes.json().catch(() => null);
  if (!rowRes.ok || !Array.isArray(rows) || rows.length === 0) return null;
  return rows[0].data || null;
}

async function deleteConnection(userId: string): Promise<void> {
  try {
    await fetch(
      supabaseBase() +
        "/rest/v1/calendar_connections?user_id=eq." +
        encodeURIComponent(userId),
      { method: "DELETE", headers: supabaseHeaders() },
    );
  } catch {
    // Best effort: a stale row just means status keeps saying connected
    // until the next check, which re-validates on use.
  }
}

async function fetchEvent(eventId: string): Promise<any | null> {
  const rowRes = await fetch(
    supabaseBase() +
      "/rest/v1/events?select=data&id=eq." +
      encodeURIComponent(eventId),
    { headers: supabaseHeaders() },
  );
  const rows = await rowRes.json().catch(() => null);
  if (!rowRes.ok || !Array.isArray(rows) || rows.length === 0) return null;
  return rows[0].data || null;
}

async function mintAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: getEnv("GOOGLE_CLIENT_ID"),
        client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenData?.access_token) return null;
    return tokenData.access_token;
  } catch {
    return null;
  }
}

function calendarEventBody(event: any): any {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : new Date(start.getTime() + 2 * 3600 * 1000);
  const location = [event.venueName, event.address, event.city]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ");
  const descriptionParts = [event.summary, event.description].filter(
    (part) => typeof part === "string" && part.trim(),
  );
  return {
    summary: event.title || "Locora event",
    description: descriptionParts.join("\n\n") || undefined,
    location: location || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

export default async function handler(req: any, res: any) {
  if (
    !getEnv("SUPABASE_URL") ||
    !getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    !getEnv("GOOGLE_CLIENT_ID") ||
    !getEnv("GOOGLE_CLIENT_SECRET")
  ) {
    return sendJson(res, 503, {
      message:
        "Google Calendar is not configured on the server. See CALENDAR_SETUP.md.",
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const userId = typeof body.userId === "string" ? body.userId : "";
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    if (!userId || !eventId || userId.length > 128) {
      return sendJson(res, 400, { message: "Missing or invalid userId/eventId" });
    }

    const connection = await fetchConnection(userId);
    if (!connection?.refresh_token_enc) {
      return sendJson(res, 200, {
        connected: false,
        message: "Google Calendar is not connected for this user.",
      });
    }

    const event = await fetchEvent(eventId);
    if (!event) return sendJson(res, 404, { message: "Event not found" });

    let refreshToken: string;
    try {
      refreshToken = await decryptRefreshToken(connection.refresh_token_enc);
    } catch {
      return sendJson(res, 502, { message: "Could not unlock the calendar connection. Please reconnect." });
    }

    const accessToken = await mintAccessToken(refreshToken);
    if (!accessToken) {
      await deleteConnection(userId);
      return sendJson(res, 200, {
        connected: false,
        revoked: true,
        message: "Google Calendar access was revoked or expired. Please reconnect.",
      });
    }

    try {
      const insertRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(calendarEventBody(event)),
        },
      );
      const inserted = await insertRes.json().catch(() => null);
      if (insertRes.status === 401) {
        await deleteConnection(userId);
        return sendJson(res, 200, {
          connected: false,
          revoked: true,
          message: "Google Calendar access was revoked. Please reconnect.",
        });
      }
      if (!insertRes.ok || !inserted?.id) {
        const detail = inserted?.error?.message || "Google Calendar insert failed";
        return sendJson(res, 502, { message: "Could not add event to Google Calendar: " + String(detail).slice(0, 200) });
      }
      return sendJson(res, 200, {
        connected: true,
        calendarEventId: inserted.id,
        htmlLink: inserted.htmlLink || null,
      });
    } catch {
      return sendJson(res, 502, { message: "Could not reach Google Calendar" });
    }
  }

  if (req.method === "DELETE") {
    const userId = firstQuery(req.query, "userId");
    const calendarEventId = firstQuery(req.query, "calendarEventId");
    if (!userId || !calendarEventId) {
      return sendJson(res, 400, { message: "Missing userId/calendarEventId" });
    }
    const connection = await fetchConnection(userId);
    if (!connection?.refresh_token_enc) {
      return sendJson(res, 200, { connected: false });
    }
    let refreshToken: string;
    try {
      refreshToken = await decryptRefreshToken(connection.refresh_token_enc);
    } catch {
      return sendJson(res, 502, { message: "Could not unlock the calendar connection. Please reconnect." });
    }
    const accessToken = await mintAccessToken(refreshToken);
    if (!accessToken) {
      await deleteConnection(userId);
      return sendJson(res, 200, { connected: false, revoked: true });
    }
    try {
      await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/" +
          encodeURIComponent(calendarEventId),
        { method: "DELETE", headers: { Authorization: "Bearer " + accessToken } },
      );
      // 404/410 from Google just means it is already gone — success either way.
      return sendJson(res, 200, { success: true, connected: true });
    } catch {
      return sendJson(res, 502, { message: "Could not reach Google Calendar" });
    }
  }

  res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  return res.end(JSON.stringify({ message: "Method not allowed" }));
}
