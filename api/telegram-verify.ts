// Telegram phone verification — free, no SMS.
//
// Flow:
//   1. The Locora profile page calls POST { action: "start", email, phone }.
//      A one-time token is stored (Supabase phone_verifications table)
//      and the caller gets a https://t.me/<bot>?start=<token> link.
//   2. The user opens the link in Telegram. The bot replies with a
//      "Share my phone number" button (request_contact).
//   3. The user taps it. Telegram sends the contact (a number Telegram
//      itself verified at signup) to this same endpoint as a webhook
//      update. If its digits match the profile number, the row becomes
//      "verified" and the profile page's status poll sees it.
//   4. The profile page then marks the profile phoneVerified.
//
// Security notes:
//   - The webhook is a public URL, so Telegram updates are authenticated
//     with the secret_token set via setWebhook: every update must carry
//     the X-Telegram-Bot-Api-Secret-Token header matching
//     TELEGRAM_WEBHOOK_SECRET. Without that secret configured, updates
//     are ignored (fail closed) — see TELEGRAM_VERIFICATION_SETUP.md.
//   - A token alone proves nothing: verification requires a Telegram
//     contact whose digits match the profile number. A token created
//     for someone else's email/phone cannot be completed with the
//     attacker's own Telegram number (digit mismatch).
//   - Tokens live 15 minutes. Verified rows are kept as the attestation
//     record (see api/registrations.ts, which server-checks them before
//     stamping a registration's phoneVerified badge).
//
// Env (Vercel Production): TELEGRAM_BOT_TOKEN (Sensitive),
// TELEGRAM_BOT_USERNAME (public), TELEGRAM_WEBHOOK_SECRET (Sensitive).
// Table: phone_verifications (token text pk, data jsonb, created_at).

function getEnv(name: string): string {
  try {
    const v = (process as any)?.env?.[name];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function sendJson(res: any, status: number, obj: any): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      const b = (req as any).body;
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

function supabaseBase(): string {
  return (getEnv("SUPABASE_URL") || "").replace(/\/$/, "");
}

function supabaseHeaders(): Record<string, string> {
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function fetchJson(
  url: string,
  init?: any,
): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

const TABLE = "phone_verifications";
const TOKEN_TTL_MS = 15 * 60 * 1000;

async function loadRows(): Promise<any[]> {
  const { ok, body } = await fetchJson(
    `${supabaseBase()}/rest/v1/${TABLE}?select=token,data`,
    { headers: supabaseHeaders() },
  );
  if (!ok) throw new Error("phone_verifications table read failed");
  if (!Array.isArray(body)) return [];
  return body.map((row: any) => ({ token: row.token, ...(row.data || {}) }));
}

async function insertRow(token: string, data: any): Promise<void> {
  const { ok } = await fetchJson(`${supabaseBase()}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ token, data }),
  });
  if (!ok) throw new Error("phone_verifications insert failed");
}

async function updateRow(token: string, data: any): Promise<void> {
  await fetchJson(
    `${supabaseBase()}/rest/v1/${TABLE}?token=eq.${encodeURIComponent(token)}`,
    {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({ data }),
    },
  );
}

async function deleteRow(token: string): Promise<void> {
  await fetchJson(
    `${supabaseBase()}/rest/v1/${TABLE}?token=eq.${encodeURIComponent(token)}`,
    { method: "DELETE", headers: supabaseHeaders() },
  );
}

function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

function numbersMatch(a: string, b: string): boolean {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // Telegram numbers carry the country code (+91…) while a profile
  // number may not. Matching the last 10 digits covers that gap.
  if (da.length >= 10 && db.length >= 10) return da.slice(-10) === db.slice(-10);
  return false;
}

function isExpired(row: any): boolean {
  const t = Date.parse(row.createdAt || "");
  if (Number.isNaN(t)) return true;
  return Date.now() - t > TOKEN_TTL_MS;
}

async function telegramSend(
  chatId: number | string,
  text: string,
  replyMarkup?: any,
): Promise<void> {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  if (!token) return;
  try {
    await fetchJson(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
  } catch {
    // Webhook replies are best-effort; the row state is the truth.
  }
}

const SHARE_KEYBOARD = {
  keyboard: [[{ text: "Share my phone number", request_contact: true }]],
  one_time_keyboard: true,
  resize_keyboard: true,
};

async function handleTelegramUpdate(
  body: any,
  secretHeader: string,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = getEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || secretHeader !== secret) {
    return { ok: false, reason: "webhook secret missing or mismatch" };
  }
  const msg = body.message;
  if (!msg || !msg.chat || msg.chat.id === undefined) return { ok: true };
  const chatId = msg.chat.id;

  // Contact shared: the verification moment.
  if (msg.contact && msg.contact.phone_number) {
    let rows: any[] = [];
    try {
      rows = await loadRows();
    } catch {
      return { ok: true };
    }
    const row = rows.find(
      (r) =>
        (r.status === "pending" || r.status === "awaiting_contact") &&
        String(r.chatId) === String(chatId) &&
        !isExpired(r),
    );
    if (!row) {
      await telegramSend(
        chatId,
        "I don't have a pending verification for this chat. Open Locora → Profile → Verify via Telegram to get your personal link first.",
      );
      return { ok: true };
    }
    if (numbersMatch(msg.contact.phone_number, row.phone)) {
      await updateRow(row.token, {
        ...row,
        status: "verified",
        verifiedAt: new Date().toISOString(),
      });
      await telegramSend(
        chatId,
        "Verified! Your Locora mobile number is confirmed. You can go back to Locora — your profile now shows it as verified.",
      );
    } else {
      await telegramSend(
        chatId,
        `That number (+${digits(msg.contact.phone_number)}) doesn't match the number on your Locora profile (+${digits(row.phone)}). Please share the number you registered with, or update it on Locora and get a fresh link.`,
      );
    }
    return { ok: true };
  }

  const text = typeof msg.text === "string" ? msg.text : "";
  if (text.startsWith("/start")) {
    const token = (text.split(/\s+/)[1] || "").trim();
    if (!token) {
      await telegramSend(
        chatId,
        "Open Locora → Profile → Verify via Telegram to get your personal verification link, then tap it to come back here.",
      );
      return { ok: true };
    }
    let row: any = null;
    try {
      const rows = await loadRows();
      row = rows.find((r) => r.token === token) || null;
    } catch {
      return { ok: true };
    }
    if (!row || row.status === "verified") {
      await telegramSend(
        chatId,
        "This link is no longer valid. Get a fresh link from your Locora profile (Profile → Verify via Telegram).",
      );
      return { ok: true };
    }
    if (row.status !== "pending" && row.status !== "awaiting_contact") {
      await telegramSend(
        chatId,
        "This link is no longer valid. Get a fresh link from your Locora profile (Profile → Verify via Telegram).",
      );
      return { ok: true };
    }
    if (isExpired(row)) {
      await updateRow(row.token, { ...row, status: "expired" });
      await telegramSend(
        chatId,
        "This link expired (links last 15 minutes). Get a fresh link from your Locora profile.",
      );
      return { ok: true };
    }
    await updateRow(row.token, { ...row, chatId, status: "awaiting_contact" });
    await telegramSend(
      chatId,
      `Tap "Share my phone number" below to verify ${row.phone} on Locora. Telegram shares the number it verified when you signed up — nothing else is shared.`,
      SHARE_KEYBOARD,
    );
    return { ok: true };
  }

  if (text) {
    await telegramSend(
      chatId,
      "Open Locora → Profile → Verify via Telegram to get your personal verification link, then tap it to come back here.",
    );
  }
  return { ok: true };
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { message: "Method not allowed" });
      return;
    }
    const body = await readBody(req);

    // Telegram webhook update (no action field, has message). The
    // secret header is read here: Vercel lowercases header names.
    if (body && body.message) {
      const secretHeader =
        req.headers?.["x-telegram-bot-api-secret-token"] || "";
      const result = await handleTelegramUpdate(body, secretHeader);
      // Always 200 for Telegram so it does not retry a handled update.
      sendJson(res, 200, result);
      return;
    }

    if (!supabaseBase() || !getEnv("SUPABASE_SERVICE_ROLE_KEY")) {
      sendJson(res, 503, { message: "Verification is not set up yet (Supabase env missing)" });
      return;
    }

    if (body.action === "start") {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { message: "A valid email is required" });
        return;
      }
      const d = digits(phone);
      if (d.length < 7 || d.length > 15) {
        sendJson(res, 400, { message: "A valid mobile number is required" });
        return;
      }
      const username = getEnv("TELEGRAM_BOT_USERNAME");
      if (!username) {
        sendJson(res, 503, { message: "Telegram verification is not set up yet (bot username missing)" });
        return;
      }
      let rows: any[];
      try {
        rows = await loadRows();
      } catch {
        sendJson(res, 503, {
          message: "Verification table is not set up yet (see TELEGRAM_VERIFICATION_SETUP.md)",
        });
        return;
      }
      // One pending token per email: drop stale ones first.
      for (const r of rows) {
        if (r.email === email && (r.status === "pending" || r.status === "awaiting_contact")) {
          try {
            await deleteRow(r.token);
          } catch {
            // Best-effort; the new token still works.
          }
        }
      }
      const token = (globalThis as any).crypto
        ? (globalThis as any).crypto.randomUUID().replace(/-/g, "")
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
      try {
        await insertRow(token, {
          email,
          phone,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      } catch {
        sendJson(res, 503, {
          message: "Verification table is not set up yet (see TELEGRAM_VERIFICATION_SETUP.md)",
        });
        return;
      }
      sendJson(res, 200, {
        link: `https://t.me/${username}?start=${token}`,
        token,
        expiresInSec: Math.floor(TOKEN_TTL_MS / 1000),
      });
      return;
    }

    if (body.action === "status") {
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!token) {
        sendJson(res, 400, { message: "Token required" });
        return;
      }
      let rows: any[];
      try {
        rows = await loadRows();
      } catch {
        sendJson(res, 503, {
          message: "Verification table is not set up yet (see TELEGRAM_VERIFICATION_SETUP.md)",
        });
        return;
      }
      const row = rows.find((r) => r.token === token) || null;
      if (!row) {
        sendJson(res, 200, { status: "not_found" });
        return;
      }
      if (row.status === "verified") {
        sendJson(res, 200, { status: "verified" });
        return;
      }
      if (isExpired(row)) {
        try {
          await updateRow(row.token, { ...row, status: "expired" });
        } catch {
          // Best-effort.
        }
        sendJson(res, 200, { status: "expired" });
        return;
      }
      sendJson(res, 200, { status: row.status });
      return;
    }

    sendJson(res, 400, { message: "Unknown request" });
  } catch (err) {
    sendJson(res, 500, {
      message: err instanceof Error ? err.message : "Verification failed",
    });
  }
}
