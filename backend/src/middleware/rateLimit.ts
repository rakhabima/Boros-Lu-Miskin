import rateLimit, {
  ipKeyGenerator,
  type Store,
  type ClientRateLimitInfo
} from "express-rate-limit";
import { pool } from "../db.js";

/**
 * Fixed-window counter kept in Postgres so every serverless instance shares
 * it. One upsert per request: the row either starts a new window or increments
 * the current one.
 *
 * ponytail: fixed window, not sliding — a caller can burst across a window
 * boundary. Fine for login throttling and AI spend caps; swap for a sliding
 * window if precision ever matters.
 */
class PgRateLimitStore implements Store {
  windowMs = 60_000;

  constructor(private readonly keyPrefix: string) {}

  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
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
      [this.keyPrefix + key, this.windowMs / 1000]
    );
    return {
      totalHits: Number(rows[0].count),
      resetTime: new Date(rows[0].expires_at)
    };
  }

  async decrement(key: string) {
    await pool.query(
      `UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1`,
      [this.keyPrefix + key]
    );
  }

  async resetKey(key: string) {
    await pool.query(`DELETE FROM rate_limits WHERE key = $1`, [
      this.keyPrefix + key
    ]);
  }
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new PgRateLimitStore("auth:"),
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many attempts. Try again in a few minutes."
  }
});

export const insightsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new PgRateLimitStore("ai:"),
  // Per user when logged in; ipKeyGenerator normalises IPv6 so one client
  // cannot rotate through a /64 to bypass the cap.
  keyGenerator: (req) =>
    req.session?.userId ? `u:${req.session.userId}` : ipKeyGenerator(req.ip ?? ""),
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "AI request limit reached for this hour."
  }
});
