import pkg from "pg";
import { config } from "./config.js";

const { Pool } = pkg;

export const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.name,
  password: config.db.password,
  port: config.db.port
});
