// End-to-end tests for per-user Google Sheets mirroring. Google is a local
// mock (GOOGLE_API_MOCK_URL); nothing reaches real Google.
//
//   npm run test:integration   (stop `npm run dev` first; see harness.mjs)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { decryptToken } from "../lib/sheetsCore.ts";
import { app, BASE, createUser, jpeg, modelReply, postReceipt, sessionFor, tokenFor, setupApp, waitFor } from "./harness.mjs";

const ENC_KEY = randomBytes(32);
const LEGACY_EMAIL = "owner@legacy.test";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

// --- fake Google -----------------------------------------------------------
// Code "c-x" → refresh token "rt-x" → access token "at-x" → spreadsheet "sheet-x".
const google = {
  invalidGrant: new Set(), // refresh tokens Google no longer honours
  missing: new Set(), // spreadsheet ids the user deleted
  fail503: new Map(), // spreadsheet id → number of 503s before success
  narrowScope: new Set(), // codes where the user unticked Drive
  creates: [],
  appends: [], // { sheet, access, values }
  revoked: [],
  webhook: [] // legacy shared webhook bodies
};
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
      const url = new URL(req.url, "http://mock");
      const access = (req.headers.authorization ?? "").replace("Bearer ", "");
      const who = access.replace(/^at-/, "");
      const form = new URLSearchParams(raw);

      if (url.pathname === "/token") {
        if (form.get("grant_type") === "authorization_code") {
          const x = form.get("code").replace(/^c-/, "");
          return sendJson(res, 200, {
            access_token: `at-${x}`,
            refresh_token: `rt-${x}`,
            scope: google.narrowScope.has(form.get("code")) ? "openid" : SCOPE
          });
        }
        const rt = form.get("refresh_token");
        if (google.invalidGrant.has(rt)) return sendJson(res, 400, { error: "invalid_grant" });
        return sendJson(res, 200, { access_token: rt.replace(/^rt-/, "at-") });
      }
      if (url.pathname === "/revoke") {
        google.revoked.push(form.get("token"));
        return sendJson(res, 200, {});
      }
      if (url.pathname === "/webhook") {
        google.webhook.push(JSON.parse(raw));
        return sendJson(res, 200, {});
      }
      if (url.pathname === "/drive/v3/about") {
        return sendJson(res, 200, { user: { emailAddress: `${who}@gmail.test` } });
      }
      const m = url.pathname.match(/^\/sheets\/v4\/spreadsheets(?:\/([^/]+))?(\/values\/(.+))?$/);
      if (m) {
        const [, id, values, range] = m;
        if (!id && req.method === "POST") {
          google.creates.push(who);
          return sendJson(res, 200, {
            spreadsheetId: `sheet-${who}`,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/sheet-${who}`
          });
        }
        if (google.missing.has(id)) return sendJson(res, 404, { error: { code: 404, status: "NOT_FOUND" } });
        if (id !== `sheet-${who}`) return sendJson(res, 403, { error: { code: 403, status: "PERMISSION_DENIED" } });
        if (!values) return sendJson(res, 200, { spreadsheetId: id, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}` });
        if (decodeURIComponent(range).endsWith(":append")) {
          const left = google.fail503.get(id) ?? 0;
          if (left > 0) {
            google.fail503.set(id, left - 1);
            return sendJson(res, 503, { error: { code: 503, status: "UNAVAILABLE" } });
          }
          google.appends.push({ sheet: id, access, query: url.search, values: JSON.parse(raw).values });
        }
        return sendJson(res, 200, {});
      }
      sendJson(res, 404, {});
    });
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
});
after(() => mock?.close());

const MOCK = () => `http://127.0.0.1:${mock.address().port}`;
setupApp(() => ({
  GOOGLE_API_MOCK_URL: MOCK(),
  SHEETS_OAUTH_REDIRECT_URI: `${BASE}/api/sheets/callback`,
  SHEETS_TOKEN_ENC_KEY: ENC_KEY.toString("base64"),
  SHEETS_WEBHOOK_URL: `${MOCK()}/webhook`,
  SHEETS_LEGACY_WEBHOOK_EMAILS: ` Other@x.test , ${LEGACY_EMAIL.toUpperCase()} `
}));

// --- helpers ---------------------------------------------------------------

const cookieOf = (res, name) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];

/** GET /api/sheets/connect → { state, cookie } from the Google redirect. */
async function startConnect(sid) {
  const res = await fetch(`${BASE}/api/sheets/connect`, { redirect: "manual", headers: { cookie: `sid=${sid}` } });
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get("location"));
  return { location, state: location.searchParams.get("state"), cookie: cookieOf(res, "sheets_oauth") };
}

async function callback(sid, stateCookie, params) {
  const res = await fetch(`${BASE}/api/sheets/callback?${new URLSearchParams(params)}`, {
    redirect: "manual",
    headers: { cookie: [`sid=${sid}`, stateCookie].filter(Boolean).join("; ") }
  });
  assert.equal(res.status, 303);
  return res.headers.get("location");
}

/** Full happy-path connect for a new user; Google account suffix = `x`. */
async function connectedUser(x) {
  const userId = await createUser(x);
  const sid = await sessionFor(userId);
  const { state, cookie } = await startConnect(sid);
  assert.equal(await callback(sid, cookie, { code: `c-${x}`, state }), "/devices?sheets=connected");
  return { userId, sid, token: await tokenFor(userId) };
}

const connection = async (userId) =>
  (await app.db.query(`SELECT * FROM sheets_connections WHERE user_id = $1`, [userId])).rows[0];
const mirrorFlag = async (userId) =>
  (await app.db.query(`SELECT sheets_mirror FROM users WHERE id = $1`, [userId])).rows[0].sheets_mirror;

async function toggle(sid, enabled, origin = BASE) {
  const res = await fetch(`${BASE}/api/sheets/toggle`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: `sid=${sid}`, ...(origin && { origin }) },
    body: new URLSearchParams({ enabled })
  });
  return { status: res.status, location: res.headers.get("location") };
}

// --- connect ---------------------------------------------------------------

test("connect: Google URL asks only for drive.file, offline, with consent", async () => {
  const sid = await sessionFor(await createUser("url"));
  const { location, state, cookie } = await startConnect(sid);
  const p = location.searchParams;
  assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(p.get("scope"), SCOPE);
  assert.equal(p.get("access_type"), "offline");
  assert.equal(p.get("prompt"), "consent");
  assert.equal(p.get("redirect_uri"), `${BASE}/api/sheets/callback`);
  assert.equal(p.get("include_granted_scopes"), null);
  assert.match(state, /^[\w-]{43}$/);
  assert.ok(cookie && !cookie.endsWith("="));
});

test("callback: state mismatch, missing cookie, or another user's cookie is rejected", async () => {
  const a = await createUser("victim");
  const b = await createUser("attacker");
  const sidA = await sessionFor(a);
  const sidB = await sessionFor(b);
  const { state, cookie } = await startConnect(sidA);

  assert.equal(await callback(sidA, cookie, { code: "c-x1", state: state + "x" }), "/devices?sheets=state_error");
  assert.equal(await callback(sidA, null, { code: "c-x1", state }), "/devices?sheets=state_error");
  assert.equal(await callback(sidB, cookie, { code: "c-x1", state }), "/devices?sheets=state_error");
  assert.equal(await connection(a), undefined);
  assert.equal(await connection(b), undefined);
});

test("callback: user denies consent → friendly flag, nothing stored", async () => {
  const userId = await createUser("denier");
  const sid = await sessionFor(userId);
  const { state, cookie } = await startConnect(sid);
  assert.equal(await callback(sid, cookie, { error: "access_denied", state }), "/devices?sheets=denied");
  assert.equal(await connection(userId), undefined);
});

test("callback: Drive unticked in granular consent → scope_denied", async () => {
  const userId = await createUser("narrow");
  const sid = await sessionFor(userId);
  const { state, cookie } = await startConnect(sid);
  google.narrowScope.add("c-narrow");
  assert.equal(await callback(sid, cookie, { code: "c-narrow", state }), "/devices?sheets=scope_denied");
  assert.equal(await connection(userId), undefined);
});

test("connect: creates the spreadsheet, stores only encrypted token, turns mirroring on", async () => {
  const { userId } = await connectedUser("alice");
  const c = await connection(userId);
  assert.equal(c.status, "active");
  assert.equal(c.google_email, "alice@gmail.test");
  assert.equal(c.spreadsheet_id, "sheet-alice");
  assert.ok(!c.refresh_token_enc.includes("rt-alice"), "raw refresh token stored");
  assert.equal(decryptToken(c.refresh_token_enc, ENC_KEY, `user:${userId}`), "rt-alice");
  assert.equal(await mirrorFlag(userId), true);
});

// --- mirroring -------------------------------------------------------------

test("mirror: user A's expense goes only to A's spreadsheet", async () => {
  const a = await connectedUser("anna");
  await connectedUser("budi");
  const before = google.appends.length;
  app.reply = modelReply({ merchant: "=Toko Anna", total: "12.500", kategori: "Food" });

  const r = await postReceipt(a.token, jpeg());
  assert.equal(r.status, 200);
  await waitFor(() => google.appends.length > before);
  await new Promise((res) => setTimeout(res, 300)); // nothing else should trickle in
  const added = google.appends.slice(before);
  assert.equal(added.length, 1);
  assert.equal(added[0].sheet, "sheet-anna");
  assert.equal(added[0].access, "at-anna");
  assert.match(added[0].query, /valueInputOption=USER_ENTERED/);
  const [date, merchant, amount, category] = added[0].values[0];
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(merchant, "'=Toko Anna");
  assert.equal(amount, 12500);
  assert.equal(category, "Food");
  assert.ok(google.appends.every((x) => x.sheet !== "sheet-budi"));
  assert.ok((await connection(a.userId)).last_synced_at);
});

test("mirror: transient 503s are retried, then succeed", async () => {
  const u = await connectedUser("flaky");
  google.fail503.set("sheet-flaky", 2);
  const r = await postReceipt(u.token, jpeg());
  assert.equal(r.status, 200);
  await waitFor(() => google.appends.some((x) => x.sheet === "sheet-flaky"));
  assert.equal((await connection(u.userId)).status, "active");
});

test("mirror: invalid_grant → needs_reconnect, receipt still saved", async () => {
  const u = await connectedUser("revoked");
  google.invalidGrant.add("rt-revoked");
  const r = await postReceipt(u.token, jpeg());
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  const c = await waitFor(async () => {
    const row = await connection(u.userId);
    return row.status === "needs_reconnect" && row;
  });
  assert.match(c.last_error, /dicabut/);
  assert.ok(!c.last_error.includes("rt-"));
  assert.ok(!google.appends.some((x) => x.sheet === "sheet-revoked"));
});

test("mirror: deleted spreadsheet (404) → needs_reconnect, not silently recreated", async () => {
  const u = await connectedUser("deleter");
  google.missing.add("sheet-deleter");
  const creates = google.creates.length;
  const r = await postReceipt(u.token, jpeg());
  assert.equal(r.status, 200);
  const c = await waitFor(async () => {
    const row = await connection(u.userId);
    return row.status === "needs_reconnect" && row;
  });
  assert.match(c.last_error, /tidak ditemukan/);
  assert.equal(google.creates.length, creates);
});

// --- toggle / disconnect -----------------------------------------------------

test("toggle: cannot be turned on without an active connection", async () => {
  const userId = await createUser("noconn");
  const sid = await sessionFor(userId);
  assert.deepEqual(await toggle(sid, "on"), { status: 303, location: "/devices?sheets=connect_first" });
  assert.equal(await mirrorFlag(userId), false);
  assert.equal((await toggle(sid, "on", null)).status, 403, "no Origin");

  const u = await connectedUser("toggler");
  assert.equal((await toggle(u.sid, "off")).location, "/devices");
  assert.equal(await mirrorFlag(u.userId), false);
  assert.equal((await toggle(u.sid, "on")).location, "/devices");
  assert.equal(await mirrorFlag(u.userId), true);

  await app.db.query(`UPDATE sheets_connections SET status = 'needs_reconnect' WHERE user_id = $1`, [u.userId]);
  await toggle(u.sid, "off");
  assert.equal((await toggle(u.sid, "on")).location, "/devices?sheets=connect_first");
});

test("disconnect: revokes at Google, deletes the row, keeps the spreadsheet", async () => {
  const u = await connectedUser("leaver");
  const res = await fetch(`${BASE}/api/sheets/disconnect`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: `sid=${u.sid}`, origin: BASE }
  });
  assert.equal(res.headers.get("location"), "/devices?sheets=disconnected");
  assert.ok(google.revoked.includes("rt-leaver"));
  assert.equal(await connection(u.userId), undefined);
  assert.equal(await mirrorFlag(u.userId), false);
});

// --- legacy webhook --------------------------------------------------------

test("legacy webhook: only allowlisted users ever reach the shared webhook", async () => {
  const owner = await createUser("owner", LEGACY_EMAIL);
  const ownerSid = await sessionFor(owner);
  assert.equal((await toggle(ownerSid, "on")).location, "/devices", "allowlisted may enable without OAuth");

  const other = await createUser("budi-legacy");
  assert.equal((await toggle(await sessionFor(other), "on")).location, "/devices?sheets=connect_first");
  // Even if the flag were set some other way, B must not reach the webhook.
  await app.db.query(`UPDATE users SET sheets_mirror = TRUE WHERE id = $1`, [other]);

  const before = google.webhook.length;
  app.reply = modelReply({ merchant: "Toko Budi", total: "77.000" });
  assert.equal((await postReceipt(await tokenFor(other), jpeg())).status, 200);
  app.reply = modelReply({ merchant: "Toko Owner", total: "88.000" });
  assert.equal((await postReceipt(await tokenFor(owner), jpeg())).status, 200);

  await waitFor(() => google.webhook.length > before);
  await new Promise((res) => setTimeout(res, 500));
  const sent = google.webhook.slice(before);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].merchant, "Toko Owner");
  assert.ok(!sent.some((b) => b.merchant === "Toko Budi"));
});
