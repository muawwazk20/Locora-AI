// GET / PATCH / DELETE /api/events/:id — one shared event.
// Self-contained Vercel Serverless Function, same Supabase setup as
// api/events.ts (see SHARED_EVENTS_SETUP.md). The service-role key is
// server-only and never reaches the browser.

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
    Prefer: "return=representation",
  };
}

function supabaseBase(): string {
  return getEnv("SUPABASE_URL").replace(/\/$/, "");
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

async function fetchEvent(id: string): Promise<any | null> {
  const res = await fetch(
    supabaseBase() + "/rest/v1/events?select=data&id=eq." + encodeURIComponent(id),
    { headers: supabaseHeaders() },
  );
  const rows = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(rows)) return null;
  return rows.length > 0 ? rows[0].data : null;
}

export default async function handler(req: any, res: any) {
  if (!getEnv("SUPABASE_URL") || !getEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    return sendJson(res, 503, {
      message:
        "Shared events database is not configured on the server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel (Production) and redeploy. See SHARED_EVENTS_SETUP.md.",
    });
  }

  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (typeof id !== "string" || !id) {
    return sendJson(res, 400, { message: "Missing event id" });
  }

  if (req.method === "GET") {
    const event = await fetchEvent(id);
    if (!event) return sendJson(res, 404, { message: "Event not found" });
    return sendJson(res, 200, event);
  }

  if (req.method === "PATCH") {
    const existing = await fetchEvent(id);
    if (!existing) return sendJson(res, 404, { message: "Event not found" });
    const updates = await readBody(req);
    const merged = { ...existing, ...updates, id: existing.id };
    const supa = await fetch(
      supabaseBase() + "/rest/v1/events?id=eq." + encodeURIComponent(id),
      { method: "PATCH", headers: supabaseHeaders(), body: JSON.stringify({ data: merged }) },
    );
    if (!supa.ok) {
      const rows = await supa.json().catch(() => null);
      const detail = rows && rows.message ? rows.message : "Supabase update failed";
      return sendJson(res, 502, { message: "Could not update shared event: " + detail });
    }
    return sendJson(res, 200, merged);
  }

  if (req.method === "DELETE") {
    await fetch(supabaseBase() + "/rest/v1/events?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      headers: supabaseHeaders(),
    });
    return sendJson(res, 200, { success: true });
  }

  res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  return res.end(JSON.stringify({ message: "Method not allowed" }));
}
