import pkg from "pg";
import { config } from "./config.js";

const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: config.db.user,
        host: config.db.host,
        database: config.db.name,
        password: config.db.password,
        port: config.db.port
      }
);
