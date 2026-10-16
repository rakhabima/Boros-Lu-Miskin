import { randomBytes, randomInt } from "crypto";
import { pool } from "./db";
import { sha256 } from "./receipt";

const CODE_TTL_SEC = 10 * 60;
// No 0/O/1/I so the code survives being read off a screen and typed on a phone.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type Device = {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export async function createConnectCode(userId: number): Promise<string> {
  await pool.query(`DELETE FROM device_connect_codes WHERE expires_at < NOW()`);
  const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  await pool.query(
    `INSERT INTO device_connect_codes (code_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + make_interval(secs => $3))`,
    [sha256(code), userId, CODE_TTL_SEC]
  );
  return code;
}

/** Burns the code (single-use) and mints a device token. Returns null if the code is bad. */
export async function exchangeConnectCode(code: string, name: string): Promise<string | null> {
  const { rows } = await pool.query(
    `DELETE FROM device_connect_codes WHERE code_hash = $1 RETURNING user_id, expires_at > NOW() AS live`,
    [sha256(code.trim().toUpperCase())]
  );
  if (!rows[0]?.live) return null;
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO devices (user_id, name, token_hash) VALUES ($1, $2, $3)`,
    [rows[0].user_id, name, sha256(token)]
  );
  return token;
}

export async function deviceFromBearer(
  authorization: string | null
): Promise<{ id: number; user_id: number } | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const { rows } = await pool.query(
    `UPDATE devices SET last_used_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING id, user_id`,
    [sha256(token)]
  );
  return rows[0] ?? null;
}

export async function listDevices(userId: number): Promise<Device[]> {
  const { rows } = await pool.query(
    `SELECT id, name, created_at, last_used_at, revoked_at
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
