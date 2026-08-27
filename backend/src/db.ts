import pkg from "pg";
import { config } from "./config.js";

const { Pool } = pkg;

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
        idleTimeoutMillis: 10_000
      }
    : {
        user: config.db.user,
        host: config.db.host,
        database: config.db.name,
        password: config.db.password,
        port: config.db.port
      }
);
