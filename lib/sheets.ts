import { pool } from "./db";
import { config } from "./config";
import {
  classify,
  decryptToken,
  encryptToken,
  parseEncKey,
  sheetRow,
  SHEET_HEADER,
  type Failure,
  type MirrorRow
} from "./sheetsCore";

// Only files this app creates; also enough for the Sheets API on them.
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TITLE = "Boros Lu Miskin";
const TAB = "Pengeluaran";

const mock = config.sheets.googleMockUrl;
const G = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: mock ? `${mock}/token` : "https://oauth2.googleapis.com/token",
  revoke: mock ? `${mock}/revoke` : "https://oauth2.googleapis.com/revoke",
  about: mock ? `${mock}/drive/v3/about` : "https://www.googleapis.com/drive/v3/about",
  sheets: mock ? `${mock}/sheets/v4/spreadsheets` : "https://sheets.googleapis.com/v4/spreadsheets"
};

/** Env vars still missing for the Sheets OAuth flow (empty = ready). */
export function missingSheetsConfig(): string[] {
  const missing = [];
  if (!config.sheets.redirectUri) missing.push("SHEETS_OAUTH_REDIRECT_URI");
  try {
    parseEncKey(config.sheets.encKey);
  } catch {
    missing.push("SHEETS_TOKEN_ENC_KEY");
  }
  return missing;
}

/**
 * A separate grant from login: its own scope, its own refresh token.
 * No include_granted_scopes, which would fold the login scopes into it.
 */
export function authUrl(state: string): string {
  return (
    `${G.auth}?` +
    new URLSearchParams({
      client_id: config.auth.googleClientId,
      redirect_uri: config.sheets.redirectUri,
      response_type: "code",
      scope: SHEETS_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state
    })
  );
}

/** Message carries only the status and Google's error code, never a token. */
class GoogleError extends Error {
  constructor(public status: number, public code?: string) {
    super(`google ${status}${code ? ` ${code}` : ""}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google JSON
async function call(url: string, init: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GoogleError(0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleError(res.status, typeof body.error === "string" ? body.error : body.error?.status);
  }
  return body;
}

const tokenRequest = (params: Record<string, string>) =>
  call(G.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.auth.googleClientId,
      client_secret: config.auth.googleClientSecret,
      ...params
    })
  });

const aad = (userId: number) => `user:${userId}`;

export const isLegacyWebhookUser = (email: string | null) =>
  !!config.sheets.webhookUrl && !!email && config.sheets.legacyEmails.includes(email.toLowerCase());

/**
 * OAuth callback: code → refresh token → spreadsheet in the user's Drive.
 * Reconnecting reuses the existing spreadsheet when this grant can still open
 * it; otherwise (deleted, or another Google account) a new one is created.
 */
export async function connectFromCode(
  userId: number,
  code: string
): Promise<"connected" | "no_refresh" | "scope_denied"> {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.sheets.redirectUri
  });
  return finishConnect(userId, t);
}

/**
 * Everything after the token exchange: scope check, spreadsheet, encrypted
 * refresh token, mirroring on. Also used by Google sign-up, which already
 * holds the token response (the code is single use).
 */
export async function finishConnect(
  userId: number,
  t: { access_token: string; refresh_token?: string; scope?: string }
): Promise<"connected" | "no_refresh" | "scope_denied"> {
  if (!t.refresh_token) return "no_refresh";
  // Granular consent lets the user untick Drive and still "allow".
  if (!String(t.scope ?? "").split(" ").includes(SHEETS_SCOPE)) return "scope_denied";
  const auth = { Authorization: `Bearer ${t.access_token}` };

  const about = await call(`${G.about}?fields=user(emailAddress)`, { headers: auth });
  const prev = await pool.query(`SELECT spreadsheet_id FROM sheets_connections WHERE user_id = $1`, [userId]);
  let sheet = prev.rows[0]
    ? await call(`${G.sheets}/${prev.rows[0].spreadsheet_id}?fields=spreadsheetId,spreadsheetUrl`, {
        headers: auth
      }).catch(() => null)
    : null;
  if (!sheet) {
    sheet = await call(G.sheets, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title: TITLE }, sheets: [{ properties: { title: TAB } }] })
    });
    await call(
      `${G.sheets}/${sheet.spreadsheetId}/values/${encodeURIComponent(`${TAB}!A1`)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [SHEET_HEADER] })
      }
    );
  }

  const enc = encryptToken(t.refresh_token, parseEncKey(config.sheets.encKey), aad(userId));
  await pool.query(
    `INSERT INTO sheets_connections
       (user_id, google_email, spreadsheet_id, spreadsheet_url, refresh_token_enc, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (user_id) DO UPDATE SET
       google_email = EXCLUDED.google_email,
       spreadsheet_id = EXCLUDED.spreadsheet_id,
       spreadsheet_url = EXCLUDED.spreadsheet_url,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       status = 'active', last_error = NULL, updated_at = NOW()`,
    [userId, about.user?.emailAddress ?? null, sheet.spreadsheetId, sheet.spreadsheetUrl, enc]
  );
  await pool.query(`UPDATE users SET sheets_mirror = TRUE WHERE id = $1`, [userId]);
  return "connected";
}

/** Deletes our record and revokes at Google (best effort). The spreadsheet stays. */
export async function disconnectSheets(userId: number): Promise<void> {
  const { rows } = await pool.query(
    `DELETE FROM sheets_connections WHERE user_id = $1 RETURNING refresh_token_enc`,
    [userId]
  );
  await pool.query(`UPDATE users SET sheets_mirror = FALSE WHERE id = $1`, [userId]);
  if (!rows[0]) return;
  try {
    const token = decryptToken(rows[0].refresh_token_enc, parseEncKey(config.sheets.encKey), aad(userId));
    await call(G.revoke, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token })
    });
  } catch (err) {
    console.error("[sheets] revoke failed", err instanceof Error ? err.message : "error");
  }
}

/** Turning on needs an active connection, or a legacy webhook allowance. */
export async function setSheetsMirror(userId: number, enabled: boolean): Promise<boolean> {
  if (enabled) {
    const { rows } = await pool.query(
      `SELECT u.email, c.status FROM users u
       LEFT JOIN sheets_connections c ON c.user_id = u.id WHERE u.id = $1`,
      [userId]
    );
    const r = rows[0];
    const allowed = r?.status === "active" || (!r?.status && isLegacyWebhookUser(r?.email));
    if (!allowed) return false;
  }
  await pool.query(`UPDATE users SET sheets_mirror = $1 WHERE id = $2`, [enabled, userId]);
  return true;
}

/**
 * Runs after the receipt response (via after()). Never throws: a Sheets
 * problem only changes the connection status, never the saved expense.
 * Mirrors when the toggle is on AND the connection is active, or 'error'
 * (a non-auth failure, retried on the next receipt). Legacy webhook only for
 * allowlisted users with no OAuth connection at all.
 */
export async function mirrorReceipt(userId: number, row: MirrorRow): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT u.sheets_mirror, u.email, c.status, c.spreadsheet_id, c.refresh_token_enc
       FROM users u LEFT JOIN sheets_connections c ON c.user_id = u.id WHERE u.id = $1`,
      [userId]
    );
    const r = rows[0];
    if (!r?.sheets_mirror) return;
    if (r.status === "active" || r.status === "error") {
      await appendRow(userId, r.spreadsheet_id, r.refresh_token_enc, row);
    } else if (!r.status && isLegacyWebhookUser(r.email)) {
      await postLegacyWebhook(row);
    }
  } catch (err) {
    console.error("[sheets] mirror failed", err instanceof Error ? err.message : "error");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function appendRow(userId: number, spreadsheetId: string, enc: string, row: MirrorRow) {
  let refresh: string;
  try {
    refresh = decryptToken(enc, parseEncKey(config.sheets.encKey), aad(userId));
  } catch {
    // Key rotated or row tampered: the stored token is unusable.
    return setStatus(userId, "needs_reconnect", "Token tersimpan tidak bisa dibaca. Hubungkan ulang.");
  }

  let access: string | undefined;
  let failure: Failure = "fail";
  let detail = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      access ??= (await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh })).access_token;
      await call(
        `${G.sheets}/${spreadsheetId}/values/${encodeURIComponent(TAB)}:append` +
          `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [sheetRow(row)] })
        }
      );
      return setStatus(userId, "active", null, true);
    } catch (err) {
      const e = err instanceof GoogleError ? err : new GoogleError(0);
      failure = classify(e.status, e.code);
      detail = e.message;
      if (failure !== "retry" || attempt === 3) break;
      await sleep(500 * 3 ** (attempt - 1)); // 0.5 s, 1.5 s
    }
  }

  if (failure === "reconnect") {
    await setStatus(userId, "needs_reconnect", "Akses Google dicabut atau kedaluwarsa. Hubungkan ulang.");
  } else if (failure === "missing") {
    await setStatus(
      userId,
      "needs_reconnect",
      "Spreadsheet tidak ditemukan (mungkin dihapus). Hubungkan ulang untuk membuat yang baru."
    );
  } else {
    await setStatus(userId, "error", `Gagal menyalin ke Google Sheets (${detail}). Dicoba lagi di struk berikutnya.`);
  }
}

async function setStatus(userId: number, status: string, lastError: string | null, synced = false) {
  await pool.query(
    `UPDATE sheets_connections SET status = $2, last_error = $3,
       last_synced_at = CASE WHEN $4 THEN NOW() ELSE last_synced_at END, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, status, lastError, synced]
  );
}

async function postLegacyWebhook(row: MirrorRow) {
  const { webhookUrl, secret } = config.sheets;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(secret && { secret }), ...row }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) console.error("[sheets] legacy webhook failed", res.status);
}
