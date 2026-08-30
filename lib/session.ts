import { cache } from "react";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "./db";
import { config } from "./config";
import type { User } from "@/types";

const COOKIE = "sid";

const USER_COLUMNS = "id, google_id, email, name, avatar_url";

/**
 * Resolves the session cookie to a user. Wrapped in React's cache() so a layout
 * and several components calling requireUser() in one request cost one query.
 */
export const getSession = cache(async (): Promise<User | null> => {
  const sid = (await cookies()).get(COOKIE)?.value;
  if (!sid) return null;

  const { rows } = await pool.query(
    `SELECT sess FROM user_sessions WHERE sid = $1 AND expire > NOW()`,
    [sid]
  );
  const userId = rows[0]?.sess?.userId;
  if (!userId) return null;

  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/**
 * Issues a new session. The old row is deleted first — this is the port of
 * req.session.regenerate(), which guards against session fixation.
 */
export async function createSession(userId: number): Promise<void> {
  const jar = await cookies();
  const previous = jar.get(COOKIE)?.value;
  if (previous) {
    await pool.query(`DELETE FROM user_sessions WHERE sid = $1`, [previous]);
  }

  // connect-pg-simple swept expired rows hourly; dropping it dropped the sweep.
  // Serverless has no scheduler, so prune opportunistically on login instead.
  // ponytail: piggybacks on login frequency. If logins ever get rare relative to
  // session churn, move this to a cron.
  await pool.query(`DELETE FROM user_sessions WHERE expire < NOW()`);

  const sid = randomBytes(32).toString("hex");
  const expire = new Date(Date.now() + config.session.ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2, $3)`,
    [sid, JSON.stringify({ userId }), expire]
  );

  jar.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.session.isProd,
    path: "/",
    expires: expire
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) {
    await pool.query(`DELETE FROM user_sessions WHERE sid = $1`, [sid]);
  }
  jar.delete(COOKIE);
}
