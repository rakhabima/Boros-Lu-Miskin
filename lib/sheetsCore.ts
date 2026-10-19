// Pure Google Sheets helpers. No DB, no Next imports, so `node --test` can
// load it directly.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// --- Refresh-token encryption (AES-256-GCM) ----------------------------------

/** SHEETS_TOKEN_ENC_KEY → 32-byte key, or a clear error naming the fix. */
export function parseEncKey(b64: string | undefined): Buffer {
  const key = Buffer.from(b64 ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("SHEETS_TOKEN_ENC_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
  }
  return key;
}

/**
 * "v1:" + base64(iv | tag | ciphertext). A fresh 12-byte IV per call, so the
 * same token never encrypts to the same text. `aad` binds the ciphertext to
 * its row (the user id): copying it onto another user's row fails to decrypt.
 */
export function encryptToken(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptToken(enc: string, key: Buffer, aad: string): string {
  if (!enc.startsWith("v1:")) throw new Error("unknown token encoding");
  const raw = Buffer.from(enc.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

// --- OAuth state bound to the session user ------------------------------------

export const SHEETS_STATE_COOKIE = "sheets_oauth";

const hmac = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("base64url");

/** Cookie value "<state>.<userId>.<hmac>". The state alone goes to Google. */
export function signState(state: string, userId: number, secret: string): string {
  return `${state}.${userId}.${hmac(secret, `${state}.${userId}`)}`;
}

/** True only if the cookie is ours, names this user, and carries this state. */
export function verifyState(
  cookie: string | undefined,
  state: string | null,
  userId: number,
  secret: string
): boolean {
  const [s, uid, mac] = (cookie ?? "").split(".");
  if (!s || !uid || !mac || !state || Number(uid) !== userId) return false;
  const eq = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  return eq(mac, hmac(secret, `${s}.${uid}`)) && eq(s, state);
}

// --- Rows ----------------------------------------------------------------------

export const SHEET_HEADER = ["Waktu Catat", "Tanggal", "Merchant", "Kategori", "Total", "Items", "Perlu dicek"];

export type MirrorRow = {
  recorded_at: string; // ISO instant the expense was saved
  date: string; // yyyy-MM-dd
  merchant: string;
  amount: number;
  category: string;
  notes: string | null; // item list; the "Items" column
  needs_review: boolean;
};

/** "yyyy-MM-dd HH:mm:ss" in Asia/Jakarta (sv-SE formats exactly like that). */
const jakartaStamp = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });

/**
 * Written with valueInputOption=USER_ENTERED so the timestamp and date become
 * real date-times and the amount a number. Text cells come from the receipt
 * image, so a leading = + - @ is escaped with ' to stop it running as a formula.
 */
export function sheetRow(r: MirrorRow): (string | number | boolean)[] {
  const text = (s: string | null) => (s && /^[=+\-@]/.test(s) ? `'${s}` : s ?? "");
  return [jakartaStamp(r.recorded_at), r.date, text(r.merchant), text(r.category), r.amount, text(r.notes), r.needs_review];
}

// --- Google error classification -------------------------------------------------

export type Failure = "retry" | "reconnect" | "missing" | "fail";

/**
 * retry: 429, 5xx, network/timeout (status 0). reconnect: invalid_grant, 401,
 * 403 (access revoked). missing: 404, the spreadsheet is gone. fail: anything
 * else, kept as status 'error' and retried on the next receipt.
 */
export function classify(status: number, errorCode?: string): Failure {
  if (errorCode === "invalid_grant") return "reconnect";
  if (status === 0 || status === 429 || status >= 500) return "retry";
  if (status === 401 || status === 403) return "reconnect";
  if (status === 404) return "missing";
  return "fail";
}
