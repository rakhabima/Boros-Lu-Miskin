// Shared setup for the integration tests: a throwaway LOCAL database
// (expense_tracker_test) built from schema.sql, a fake 9router, and
// `next dev` on :3077 pointed at both. Connects to local Postgres as the OS
// user (like psql) and passes every env var the app needs, so .env.local is
// never relied on. Never touches the dev database or any remote one.
//
// Next 16 allows one `next dev` per project folder: stop `npm run dev` first.
import { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { userInfo } from "node:os";
import pg from "pg";

const DB = "expense_tracker_test";
const PORT = 3077;
export const BASE = `http://127.0.0.1:${PORT}`;
const PG = { host: "localhost" };

export const sha = (s) => createHash("sha256").update(s).digest("hex");
export const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(512)]);
export const modelReply = (fields = {}) =>
  "```json\n" +
  JSON.stringify({
    merchant: "Indomaret",
    tanggal: null,
    total: "45.000",
    kategori: "Food",
    items: [],
    confidence: 0.95,
    ...fields
  }) +
  "\n```";

/** Live handles for the tests: `app.db`, and the fake model's reply/calls. */
export const app = { db: null, reply: modelReply(), modelCalls: 0 };

/** Registers the before/after hooks. `env` is a function, read after earlier hooks ran. */
export function setupApp(env = () => ({})) {
  let server, model;

  before(async () => {
    const admin = new pg.Client({ ...PG, database: "postgres" });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.end();

    app.db = new pg.Client({ ...PG, database: DB });
    await app.db.connect();
    await app.db.query(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));

    model = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        app.modelCalls++;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: app.reply } }] }));
      });
    });
    await new Promise((r) => model.listen(0, "127.0.0.1", r));

    const fullEnv = {
      ...process.env,
      DB_NAME: DB,
      DB_HOST: "localhost",
      DB_PORT: "5432",
      DB_USER: process.env.PGUSER || userInfo().username,
      DB_PASSWORD: process.env.PGPASSWORD || "unused-with-local-trust-auth",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      BACKEND_ORIGIN: BASE,
      FRONTEND_ORIGIN: BASE,
      SESSION_SECRET: "test",
      TZ: "Asia/Jakarta",
      NINEROUTER_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`,
      NINEROUTER_API_KEY: "test",
      RECEIPT_HOURLY_LIMIT: "5",
      RECEIPT_DAILY_CAP: "1000",
      SHEETS_WEBHOOK_URL: "",
      SHEETS_LEGACY_WEBHOOK_EMAILS: "",
      SHEETS_OAUTH_REDIRECT_URI: "",
      SHEETS_TOKEN_ENC_KEY: "",
      GOOGLE_API_MOCK_URL: "",
      ONBOARDING_GATE_ENABLED: "",
      SHORTCUT_INSTALL_URL: "",
      APP_BASE_URL: "",
      ...env()
    };
    delete fullEnv.DATABASE_URL;
    server = spawn("node_modules/.bin/next", ["dev", "-p", String(PORT), "-H", "127.0.0.1"], {
      env: fullEnv,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let log = "";
    server.stdout.on("data", (d) => (log += d));
    server.stderr.on("data", (d) => (log += d));
    let exited = false;
    server.on("exit", () => (exited = true));

    // First request compiles the route; wait until the app answers.
    const deadline = Date.now() + 90_000;
    for (;;) {
      try {
        if ((await fetch(`${BASE}/login`)).ok) break;
      } catch {}
      if (exited || Date.now() > deadline) {
        throw new Error(`dev server did not start:\n${log.slice(-1500)}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  // Each step on its own: a failed start must not leave the run hanging.
  after(async () => {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    model?.close();
    await app.db?.end().catch(() => {});
    const admin = new pg.Client({ ...PG, database: "postgres" });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.end();
  });

  // Each test starts with fresh counters, so limits only trip where intended.
  beforeEach(async () => {
    await app.db.query(`DELETE FROM rate_limits`);
    app.reply = modelReply();
  });
}

// --- helpers ---------------------------------------------------------------

export async function createUser(name, email = `${name}-${randomBytes(4).toString("hex")}@test.local`) {
  const { rows } = await app.db.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [email, name]
  );
  return rows[0].id;
}

export async function sessionFor(userId) {
  const sid = randomBytes(32).toString("hex");
  await app.db.query(
    `INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2, NOW() + interval '1 hour')`,
    [sid, JSON.stringify({ userId })]
  );
  return sid;
}

export async function insertCode(userId, expires = "5 minutes") {
  const code = randomBytes(32).toString("base64url");
  await app.db.query(
    `INSERT INTO device_connect_codes (code_hash, user_id, expires_at) VALUES ($1, $2, NOW() + $3::interval)`,
    [sha(code), userId, expires]
  );
  return code;
}

export async function exchange(code) {
  const res = await fetch(`${BASE}/api/connect/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, device_name: "Test iPhone" })
  });
  return { status: res.status, json: await res.json() };
}

export async function tokenFor(userId) {
  const { status, json } = await exchange(await insertCode(userId));
  assert.equal(status, 200);
  return json.token;
}

export async function postReceipt(token, image, { multipart = false, extra = {} } = {}) {
  let body, headers = { authorization: `Bearer ${token}` };
  if (multipart) {
    body = new FormData();
    body.append("image", new Blob([image], { type: "image/jpeg" }), "s.jpg");
    for (const [k, v] of Object.entries(extra)) body.append(k, String(v));
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ mime: "image/jpeg", image: image.toString("base64"), ...extra });
  }
  const res = await fetch(`${BASE}/api/receipts`, { method: "POST", headers, body });
  return { status: res.status, json: await res.json() };
}

export const countExpenses = async (userId) =>
  Number((await app.db.query(`SELECT count(*) FROM expenses WHERE user_id = $1`, [userId])).rows[0].count);

/** Polls until fn() is truthy; for work the app does after the response. */
export async function waitFor(fn, ms = 15_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
}
