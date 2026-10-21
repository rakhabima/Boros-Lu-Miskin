// End-to-end tests for the mandatory onboarding gate (flag ON). Google is a
// local mock; nothing reaches real Google.
//
//   npm run test:integration   (stop `npm run dev` first; see harness.mjs)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import QRCode from "qrcode";
import { app, BASE, createUser, sessionFor, setupApp, tokenFor } from "./harness.mjs";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const LAPTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const APP_BASE = "https://app.example.test";
const INSTALL = "https://www.icloud.com/shortcuts/test-install";
const RETRY = "Akses Google Drive diperlukan. Centang izin Drive di layar Google, lalu coba lagi.";

// --- minimal fake Google: code "c-x" → access "at-x" → spreadsheet "sheet-x" ---
const google = { narrowScope: new Set() };
let mock;
const sendJson = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
before(async () => {
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = new URL(req.url, "http://mock").pathname;
      const form = new URLSearchParams(raw);
      const who = (req.headers.authorization ?? "").replace("Bearer at-", "");
      if (path === "/token") {
        const x = (form.get("code") ?? "").replace(/^c-/, "");
        return sendJson(res, 200, {
          access_token: `at-${x}`,
          refresh_token: `rt-${x}`,
          scope: google.narrowScope.has(form.get("code")) ? "openid" : SCOPE
        });
      }
      if (path === "/revoke") return sendJson(res, 200, {});
      if (path === "/drive/v3/about") return sendJson(res, 200, { user: { emailAddress: `${who}@gmail.test` } });
      if (path.startsWith("/sheets/v4/spreadsheets")) {
        return sendJson(res, 200, {
          spreadsheetId: `sheet-${who}`,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/sheet-${who}`
        });
      }
      sendJson(res, 404, {});
    });
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
});
after(() => mock?.close());

setupApp(() => ({
  GOOGLE_API_MOCK_URL: `http://127.0.0.1:${mock.address().port}`,
  SHEETS_OAUTH_REDIRECT_URI: `${BASE}/api/sheets/callback`,
  SHEETS_TOKEN_ENC_KEY: randomBytes(32).toString("base64"),
  ONBOARDING_GATE_ENABLED: "true",
  SHORTCUT_INSTALL_URL: INSTALL,
  APP_BASE_URL: APP_BASE
}));

// --- helpers ---------------------------------------------------------------

const get = (path, sid, ua = LAPTOP) =>
  fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie: sid ? `sid=${sid}` : "", "user-agent": ua } });
const postForm = (path, sid, body = {}) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: `sid=${sid}`, origin: BASE },
    body: new URLSearchParams(body)
  });

async function newUser(name) {
  const userId = await createUser(name);
  return { userId, sid: await sessionFor(userId) };
}
const cookieOf = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];

/** Sheets OAuth round trip. Returns the callback's Location. */
async function sheetsFlow(sid, { ret = "/connect", code, params } = {}) {
  const res = await get(`/api/sheets/connect${ret ? `?return=${encodeURIComponent(ret)}` : ""}`, sid);
  assert.equal(res.status, 302);
  const state = new URL(res.headers.get("location")).searchParams.get("state");
  const cb = await fetch(`${BASE}/api/sheets/callback?${new URLSearchParams({ state, ...(code && { code }), ...params })}`, {
    redirect: "manual",
    headers: { cookie: `sid=${sid}; ${cookieOf(res, "sheets_oauth")}` }
  });
  assert.equal(cb.status, 303);
  return cb.headers.get("location");
}

const status = async (sid) => (await get("/api/onboarding/status", sid)).json();
const completedAt = async (userId) =>
  (await app.db.query(`SELECT onboarding_completed_at AS t FROM users WHERE id = $1`, [userId])).rows[0].t;
const redirectsToConnect = (res) => res.status >= 300 && res.status < 400 && new URL(res.headers.get("location"), BASE).pathname === "/connect";

// --- gate --------------------------------------------------------------------

test("gate on: a new user is redirected from every dashboard page to /connect", async () => {
  const { sid } = await newUser("fresh");
  for (const path of ["/", "/insights", "/devices"]) {
    const res = await get(path, sid);
    assert.equal(res.status, 307, path);
    assert.equal(new URL(res.headers.get("location"), BASE).pathname, "/connect", path);
  }
});

test("gate: existing (migrated) users are never gated", async () => {
  const { userId, sid } = await newUser("veteran");
  await app.db.query(`UPDATE users SET onboarding_completed_at = NOW() WHERE id = $1`, [userId]);
  assert.equal((await get("/", sid)).status, 200);
});

test("migration: marks existing users onboarded once, and re-running never touches new users", async () => {
  const sql = await readFile(new URL("../migrations/2026-10-onboarding-gate.sql", import.meta.url), "utf8");
  const old = await createUser("legacy-user");
  await app.db.query(`ALTER TABLE users DROP COLUMN onboarding_completed_at`);
  await app.db.query(sql);
  const fresh = await createUser("after-migration");
  await app.db.query(sql); // second run: no-op
  assert.ok(await completedAt(old), "existing user must be marked onboarded");
  assert.equal(await completedAt(fresh), null, "new user must stay gated");
});

test("never-gate list: none of these paths redirects to /connect for a gated user", async () => {
  const { sid } = await newUser("gated-paths");
  const paths = [
    ["GET", "/connect"],
    ["GET", "/login"],
    ["GET", "/privacy"],
    ["GET", "/logout"],
    ["GET", "/api/auth/google"],
    ["GET", "/api/auth/google/callback"],
    ["GET", "/api/sheets/connect"],
    ["GET", "/api/sheets/callback"],
    ["POST", "/api/sheets/toggle"],
    ["POST", "/api/sheets/disconnect"],
    ["POST", "/api/connect/approve"],
    ["POST", "/api/connect/exchange"],
    ["POST", "/api/receipts"],
    ["GET", "/api/onboarding/status"]
  ];
  for (const [method, path] of paths) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      redirect: "manual",
      headers: { cookie: `sid=${sid}`, origin: BASE, "content-type": "application/json", "user-agent": LAPTOP },
      ...(method === "POST" && { body: "{}" })
    });
    assert.ok(!redirectsToConnect(res), `${method} ${path} → ${res.status} ${res.headers.get("location")}`);
  }
});

// --- /connect page -------------------------------------------------------------

test("step 2 is not available before step 1, on iPhone or laptop", async () => {
  const { sid } = await newUser("locked");
  for (const ua of [IPHONE, LAPTOP]) {
    const html = await (await get("/connect", sid, ua)).text();
    assert.match(html, /Langkah 1 dari 2/);
    assert.match(html, /Selesaikan langkah 1 dulu/);
    assert.ok(!html.includes("/api/connect/approve"), "approve form must not render");
    assert.ok(!html.includes(INSTALL), "install link must not render");
    assert.ok(!html.includes("<svg"), "QR must not render");
  }
});

test("denied consent and scope_denied show the retry message and complete nothing", async () => {
  const { userId, sid } = await newUser("denier");
  assert.equal(await sheetsFlow(sid, { params: { error: "access_denied" } }), "/connect?sheets=denied");
  google.narrowScope.add("c-narrow");
  assert.equal(await sheetsFlow(sid, { code: "c-narrow" }), "/connect?sheets=scope_denied");
  for (const flag of ["denied", "scope_denied"]) {
    const html = await (await get(`/connect?sheets=${flag}`, sid)).text();
    assert.ok(html.replaceAll("&#x27;", "'").includes(RETRY), flag);
    assert.match(html, /Hubungkan Google Sheets/);
  }
  assert.equal((await app.db.query(`SELECT 1 FROM sheets_connections WHERE user_id = $1`, [userId])).rowCount, 0);
  assert.equal(await completedAt(userId), null);
});

test("full flow: sheets, then iPhone, completes onboarding once and opens the dashboard", async () => {
  const { userId, sid } = await newUser("happy");
  assert.equal(await sheetsFlow(sid, { code: "c-happy" }), "/connect?sheets=connected");

  // Step 1 done: email shown, step 2 open. iPhone gets buttons, laptop gets the QR.
  let html = await (await get("/connect", sid, IPHONE)).text();
  assert.match(html, /happy@gmail\.test/);
  assert.match(html, /Langkah 2 dari 2/);
  assert.ok(html.includes("/api/connect/approve") && html.includes(INSTALL));
  html = await (await get("/connect", sid, LAPTOP)).text();
  assert.match(html, /Menunggu iPhone/);
  assert.match(html, /Buka di iPhone-mu, lalu masuk dengan akun yang sama/);
  const qr = await QRCode.toString(`${APP_BASE}/connect`, { type: "svg", margin: 1 });
  assert.ok(html.includes(qr), "QR must encode APP_BASE_URL + /connect");
  assert.deepEqual(await status(sid), { sheets: true, iphone: false, completed: false });
  assert.equal(await completedAt(userId), null);
  assert.equal((await get("/", sid)).status, 307);

  await tokenFor(userId); // the Shortcut's one-time-code exchange
  const page = await get("/connect", sid, IPHONE);
  assert.equal(page.status, 307);
  assert.equal(page.headers.get("location"), "/");
  const first = await completedAt(userId);
  assert.ok(first);
  assert.deepEqual(await status(sid), { sheets: true, iphone: true, completed: true });
  assert.equal((await completedAt(userId)).getTime(), first.getTime(), "completed twice");
  assert.equal((await get("/", sid)).status, 200);
  assert.match(await (await get("/connect", sid)).text(), /Semua siap/);
});

// --- status endpoint --------------------------------------------------------------

test("status: needs a session, is no-store, and exposes no secrets", async () => {
  const res = await get("/api/onboarding/status", null);
  assert.equal(res.status, 401);
  const { sid } = await newUser("statususer");
  const ok = await get("/api/onboarding/status", sid);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(await ok.json()).sort(), ["completed", "iphone", "sheets"]);
});

test("status: one missing condition never completes onboarding", async () => {
  const onlySheets = await newUser("only-sheets");
  await sheetsFlow(onlySheets.sid, { code: "c-onlysheets" });
  assert.deepEqual(await status(onlySheets.sid), { sheets: true, iphone: false, completed: false });
  assert.equal(await completedAt(onlySheets.userId), null);

  const onlyPhone = await newUser("only-phone");
  await tokenFor(onlyPhone.userId);
  assert.deepEqual(await status(onlyPhone.sid), { sheets: false, iphone: true, completed: false });
  assert.equal(await completedAt(onlyPhone.userId), null);

  // A sheets connection that needs reconnecting is not "active".
  await app.db.query(
    `INSERT INTO sheets_connections (user_id, spreadsheet_id, spreadsheet_url, refresh_token_enc, status)
     VALUES ($1, 's', 'u', 'x', 'needs_reconnect')`,
    [onlyPhone.userId]
  );
  assert.equal((await status(onlyPhone.sid)).completed, false);
});

test("a revoked-only device does not count as the iPhone step", async () => {
  const u = await newUser("revoked-only");
  await sheetsFlow(u.sid, { code: "c-revokedonly" });
  await tokenFor(u.userId);
  await app.db.query(`UPDATE devices SET revoked_at = NOW() WHERE user_id = $1`, [u.userId]);
  assert.deepEqual(await status(u.sid), { sheets: true, iphone: false, completed: false });
  assert.equal(await completedAt(u.userId), null);
});

test("an onboarded user is never re-gated by revoking devices or disconnecting Sheets", async () => {
  const u = await newUser("settled");
  await sheetsFlow(u.sid, { code: "c-settled" });
  await tokenFor(u.userId);
  assert.equal((await status(u.sid)).completed, true);

  await app.db.query(`UPDATE devices SET revoked_at = NOW() WHERE user_id = $1`, [u.userId]);
  assert.equal((await postForm("/api/sheets/disconnect", u.sid)).status, 303);
  assert.deepEqual(await status(u.sid), { sheets: false, iphone: false, completed: true });
  for (const path of ["/", "/insights", "/devices"]) assert.equal((await get(path, u.sid)).status, 200, path);
});

// --- return path -------------------------------------------------------------------

test("Sheets return path: only /connect and /devices are honoured", async () => {
  const { sid } = await newUser("returns");
  for (const bad of ["https://evil.example", "//evil.example", "/api/sheets/disconnect", "/api/auth/google"]) {
    const loc = await sheetsFlow(sid, { ret: bad, code: "c-returns" });
    assert.equal(loc, "/devices?sheets=connected", bad);
  }
  assert.equal(await sheetsFlow(sid, { ret: "/devices", code: "c-returns" }), "/devices?sheets=connected");
  assert.equal(await sheetsFlow(sid, { ret: "/connect", code: "c-returns" }), "/connect?sheets=connected");
  assert.equal(await sheetsFlow(sid, { ret: null, code: "c-returns" }), "/devices?sheets=connected");
});

test("a logged-out visitor on /connect is sent to login and brought back", async () => {
  const res = await get("/connect", null, IPHONE);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "/login?next=/connect");
});
