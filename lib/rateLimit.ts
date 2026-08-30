import { headers } from "next/headers";
import { pool } from "./db";

/**
 * Fixed-window counter kept in Postgres so every serverless instance shares it.
 * One upsert per call: the row either starts a new window or increments the
 * current one.
 *
 * ponytail: fixed window, not sliding — a caller can burst across a window
 * boundary. Fine for login throttling and AI spend caps; swap for a sliding
 * window if precision ever matters.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; resetAt: Date }> {
  const { rows } = await pool.query(
    `INSERT INTO rate_limits (key, count, expires_at)
     VALUES ($1, 1, NOW() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.expires_at < NOW()
                    THEN 1 ELSE rate_limits.count + 1 END,
       expires_at = CASE WHEN rate_limits.expires_at < NOW()
                         THEN NOW() + make_interval(secs => $2)
                         ELSE rate_limits.expires_at END
     RETURNING count, expires_at`,
    [key, windowSec]
  );
  return {
    allowed: Number(rows[0].count) <= limit,
    resetAt: new Date(rows[0].expires_at)
  };
}

/**
 * Sweep expired counters. Keys include caller-supplied values (email, IP), so
 * this table can be grown on demand; nothing else deletes from it.
 * ponytail: piggybacks on login frequency, like the session prune.
 */
export async function pruneRateLimits(): Promise<void> {
  await pool.query(`DELETE FROM rate_limits WHERE expires_at < NOW()`);
}

export const AUTH_LIMIT = { limit: 10, windowSec: 15 * 60 };
export const AI_LIMIT = { limit: 30, windowSec: 60 * 60 };

export const AUTH_IP_LIMIT = { limit: 10, windowSec: 15 * 60 };
// Deliberately looser than the IP limit. It exists to catch a targeted attack
// that rotates source IPs; a tight per-account bound would let anyone lock a
// known user out of their own account for 15 minutes just by guessing wrong.
export const AUTH_EMAIL_LIMIT = { limit: 30, windowSec: 15 * 60 };

/** Best-effort client IP. Vercel sets x-forwarded-for; the first hop is the client. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Auth throttling. The Express original keyed on IP only (express-rate-limit's
 * default), which stops one host spraying many accounts but not a distributed
 * attack on one account. We keep the IP bound for parity and add a looser
 * per-account bound; a request is throttled if either trips.
 */
export async function checkAuthRateLimit(email: string) {
  const ip = await clientIp();
  const byIp = await checkRateLimit(
    `auth:ip:${ip}`,
    AUTH_IP_LIMIT.limit,
    AUTH_IP_LIMIT.windowSec
  );
  const byEmail = await checkRateLimit(
    `auth:em:${email.toLowerCase()}`,
    AUTH_EMAIL_LIMIT.limit,
    AUTH_EMAIL_LIMIT.windowSec
  );
  return { allowed: byIp.allowed && byEmail.allowed };
}
