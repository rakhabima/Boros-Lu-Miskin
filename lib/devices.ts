import { randomBytes } from "crypto";
import { pool } from "./db";
import { config } from "./config";
import { sha256 } from "./receipt";

const CODE_TTL_SEC = 5 * 60;
export const RECEIPT_SCOPE = "receipts:create";

export type Device = {
  id: number;
  name: string;
  token_prefix: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/** 32 random bytes, handed to the Shortcut via a shortcuts:// URL. Only the hash is stored. */
export async function createConnectCode(userId: number): Promise<string> {
  await pool.query(`DELETE FROM device_connect_codes WHERE expires_at < NOW()`);
  const code = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO device_connect_codes (code_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + make_interval(secs => $3))`,
    [sha256(code), userId, CODE_TTL_SEC]
  );
  return code;
}

/**
 * Consumes the code and mints a token in ONE statement, so both commit or
 * neither does. Single use under concurrency comes from the conditional
 * UPDATE: a second request racing on the same row blocks, then re-checks
 * `consumed_at IS NULL` against the committed row and matches nothing.
 * Returns the raw token (shown once) or null for any bad/expired/used code.
 */
export async function exchangeConnectCode(code: string, name: string): Promise<string | null> {
  const token = "blm_" + randomBytes(32).toString("base64url");
  const { rows } = await pool.query(
    `WITH c AS (
       UPDATE device_connect_codes SET consumed_at = NOW()
       WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
       RETURNING user_id
     )
     INSERT INTO devices (user_id, name, token_hash, token_prefix, scope)
     SELECT user_id, $2, $3, $4, $5 FROM c
     RETURNING id`,
    [sha256(code.trim()), name, sha256(token), token.slice(0, 8), RECEIPT_SCOPE]
  );
  return rows[0] ? token : null;
}

/**
 * Lookup is by SHA-256 of the presented token, so no secret is compared in
 * JS and there is nothing to time. Revoked or wrongly scoped tokens match no
 * row. The user comes only from the token, never from the request body.
 */
export async function deviceFromBearer(
  authorization: string | null,
  scope: string
): Promise<{ id: number; user_id: number } | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const { rows } = await pool.query(
    `UPDATE devices SET last_used_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL AND scope = $2
     RETURNING id, user_id`,
    [sha256(token), scope]
  );
  return rows[0] ?? null;
}

/**
 * HTTPS only in production. Vercel and Nginx (with
 * `proxy_set_header X-Forwarded-Proto $scheme`) report the client's scheme.
 */
export const isInsecure = (req: Request) =>
  config.session.isProd && req.headers.get("x-forwarded-proto") === "http";

/**
 * CSRF guard for cookie-authenticated POSTs: the browser's Origin must be
 * this host. SameSite=Lax already blocks cross-site POSTs carrying the
 * session cookie; this also refuses requests with no Origin at all.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function listDevices(userId: number): Promise<Device[]> {
  const { rows } = await pool.query(
    `SELECT id, name, token_prefix, created_at, last_used_at, revoked_at
     FROM devices WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function revokeDevice(userId: number, id: number): Promise<void> {
  await pool.query(
    `UPDATE devices SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, userId]
  );
}

export async function recentFailedAttempts(userId: number) {
  const { rows } = await pool.query(
    `SELECT a.id, a.status, a.error_code, a.duration_ms, a.created_at, d.name AS device
     FROM receipt_attempts a LEFT JOIN devices d ON d.id = a.device_id
     WHERE a.user_id = $1 AND a.status NOT IN ('saved', 'duplicate')
     ORDER BY a.created_at DESC LIMIT 20`,
    [userId]
  );
  return rows as Array<{
    id: number;
    status: string;
    error_code: string | null;
    duration_ms: number | null;
    created_at: string;
    device: string | null;
  }>;
}
