import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";
import { config } from "./config.js";

// Sessions live in Postgres rather than each instance's memory: serverless
// spreads requests across instances that share nothing else. Reusing the
// existing pool keeps this to one service instead of two.
const PgStore = connectPgSimple(session);

export const sessionStore = new PgStore({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true,
  pruneSessionInterval: 60 * 60 // seconds; sweep expired rows hourly
});
