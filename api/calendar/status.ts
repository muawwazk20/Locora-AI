// GET /api/calendar/status?userId=... — is this Locora user's Google
// Calendar connected? DELETE with the same query disconnects it.
//
// Self-contained Vercel Serverless Function (same pattern as
// api/events.ts). Connections live in Supabase, table
// calendar_connections (user_id text primary key, data jsonb), written
// only by the OAuth callback with the service-role key. Browsers never
// see a refresh token: this endpoint only reports connected + the
// Google account email used for display.

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

export default async function handler(req: any, res: any) {
  if (!getEnv("SUPABASE_URL") || !getEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    return sendJson(res, 503, {
      message:
        "Google Calendar storage is not configured on the server. See CALENDAR_SETUP.md.",
    });
  }

  const userId = firstQuery(req.query, "userId");
  if (!userId || userId.length > 128) {
    return sendJson(res, 400, { message: "Missing or invalid userId" });
  }

  if (req.method === "GET") {
    try {
      const rowRes = await fetch(
        supabaseBase() +
          "/rest/v1/calendar_connections?select=data&user_id=eq." +
          encodeURIComponent(userId),
        { headers: supabaseHeaders() },
      );
      const rows = await rowRes.json().catch(() => null);
      if (!rowRes.ok || !Array.isArray(rows)) {
        // Distinguish the one expected pre-setup failure from a real
        // backend error: Supabase answers PGRST205 when the
        // calendar_connections table has not been created yet (setup
        // step 3). Saying so beats a generic error when diagnosing.
        if (rows && (rows as any).code === "PGRST205") {
          return sendJson(res, 503, {
            connected: false,
            message:
              "calendar_connections table has not been created yet in Supabase. See CALENDAR_SETUP.md step 3.",
          });
        }
        return sendJson(res, 502, { message: "Could not check calendar connection" });
      }
      if (rows.length === 0) return sendJson(res, 200, { connected: false, google_email: null });
      return sendJson(res, 200, {
        connected: true,
        google_email: rows[0].data?.google_email || null,
      });
    } catch {
      return sendJson(res, 502, { message: "Could not check calendar connection" });
    }
  }

  if (req.method === "DELETE") {
    try {
      await fetch(
        supabaseBase() +
          "/rest/v1/calendar_connections?user_id=eq." +
          encodeURIComponent(userId),
        { method: "DELETE", headers: supabaseHeaders() },
      );
      return sendJson(res, 200, { success: true, connected: false });
    } catch {
      return sendJson(res, 502, { message: "Could not disconnect Google Calendar" });
    }
  }

  res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  return res.end(JSON.stringify({ message: "Method not allowed" }));
}
