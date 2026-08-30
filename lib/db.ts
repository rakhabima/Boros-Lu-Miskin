import pkg from "pg";
import { config } from "./config";

const { Pool, types } = pkg;

// Approved deviation from behavior parity (spec §11). pg returns NUMERIC as a
// string, but types.ts declares `amount: number`. Parsing here makes the
// declared type true instead of relying on scattered Number() coercion.
// ponytail: float64 is exact to 2^53, far above any IDR expense. Use a decimal
// library if this ever needs to hold cents at financial scale.
types.setTypeParser(1700, Number);

// `expenses.created_at` is TIMESTAMP WITHOUT TIME ZONE, so a value's meaning
// depends on the zone it was written in and the zone it is read in. pg parses
// naive timestamps using the Node process timezone; Postgres writes them using
// the DB session timezone. Those two MUST agree or every date shifts.
//
// Local Postgres here defaults to Asia/Jakarta, but Neon and Supabase default
// to UTC — so relying on the server default silently breaks on deploy. Pin the
// session zone to match TZ (also Asia/Jakarta) and the pairing holds anywhere.
// ponytail: the real fix is TIMESTAMPTZ; that is a data migration, not a config
// line. Revisit if this app ever serves more than one timezone.
const TIMEZONE = process.env.TZ || "Asia/Jakarta";

const connectionString = process.env.DATABASE_URL;

// ponytail: max 1 connection per instance because serverless spins up many
// instances and Postgres connection slots are the scarce resource. Raise it
// (or drop the cap) if this ever runs as a single long-lived server again.
export const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 1,
        idleTimeoutMillis: 10_000,
        options: `-c timezone=${TIMEZONE}`
      }
    : {
        user: config.db.user,
        host: config.db.host,
        database: config.db.name,
        password: config.db.password,
        port: config.db.port,
        options: `-c timezone=${TIMEZONE}`
      }
);
