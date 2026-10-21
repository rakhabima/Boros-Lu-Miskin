// The single "Lanjutkan dengan Google" button: sign-in, sign-up and Sheets access in one flow. Google is a local
// mock (GOOGLE_API_MOCK_URL); nothing reaches real Google.
//
//   npm run test:integration   (stop `npm run dev` first; see harness.mjs)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { decryptToken } from "../lib/sheetsCore.ts";
import { app, BASE, setupApp } from "./harness.mjs";

const ENC_KEY = randomBytes(32);
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

// Code "c-x" → access "at-x" → Google account "x@gmail.test" → spreadsheet "sheet-x".
const google = {
  narrow: new Set(), // codes where Drive was unticked
  noRefresh: new Set(),
  failCreate: new Set(), // accounts whose spreadsheet creation returns 503
  sheetCalls: 0
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
      const path = new URL(req.url, "http://mock").pathname;
      const form = new URLSearchParams(raw);
      const who = (req.headers.authorization ?? "").replace("Bearer at-", "");
      if (path === "/token") {
        const code = form.get("code") ?? "";
        const x = code.replace(/^c-/, "");
        return sendJson(res, 200, {
          access_token: `at-${x}`,
          ...(!google.noRefresh.has(code) && { refresh_token: `rt-${x}` }),
          scope: `openid email profile${google.narrow.has(code) ? "" : ` ${SCOPE}`}`
        });
      }
      if (path === "/oauth2/v2/userinfo") {
        return sendJson(res, 200, {
          id: `gid-${who}`, email: `${who}@gmail.test`, name: who, verified_email: true, picture: null
        });
      }
      if (path === "/drive/v3/about") return sendJson(res, 200, { user: { emailAddress: `${who}@gmail.test` } });
      if (path.startsWith("/sheets/v4/spreadsheets")) {
        google.sheetCalls++;
        if (req.method === "POST" && google.failCreate.has(who)) {
          return sendJson(res, 503, { error: { code: 503, status: "UNAVAILABLE" } });
        }
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
  SHEETS_TOKEN_ENC_KEY: ENC_KEY.toString("base64"),
  ONBOARDING_GATE_ENABLED: "true",
  SHORTCUT_INSTALL_URL: "https://www.icloud.com/shortcuts/test-install"
}));

// --- helpers ---------------------------------------------------------------

const setCookies = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]);
const cookieOf = (res, name) => setCookies(res).find((c) => c.startsWith(`${name}=`));

/** Starts Google sign-in; returns the Google URL and the cookies to send back. */
async function start(intent) {
  const res = await fetch(`${BASE}/api/auth/google${intent ? `?intent=${intent}` : ""}`, { redirect: "manual" });
  assert.equal(res.status, 307);
  const location = new URL(res.headers.get("location"));
  return { location, state: location.searchParams.get("state"), cookies: setCookies(res) };
}

/** Full round trip. `mutate` lets a test tamper with the state or cookies. */
async function signIn(intent, code, { mutate, headers } = {}) {
  let { state, cookies } = await start(intent);
  if (mutate) ({ state, cookies } = mutate({ state, cookies }));
  const res = await fetch(`${BASE}/api/auth/google/callback?${new URLSearchParams({ code, state })}`, {
    redirect: "manual",
    headers: { cookie: cookies.join("; "), ...headers }
  });
  return { status: res.status, location: res.headers.get("location"), sid: cookieOf(res, "sid")?.slice(4) };
}

const userBy = async (x) => (await app.db.query(`SELECT * FROM users WHERE google_id = $1`, [`gid-${x}`])).rows[0];
const connection = async (userId) =>
  (await app.db.query(`SELECT * FROM sheets_connections WHERE user_id = $1`, [userId])).rows[0];
const countUsers = async () => Number((await app.db.query(`SELECT count(*) FROM users`)).rows[0].count);

// --- tests -----------------------------------------------------------------

test("the one button asks for login scopes + drive.file, offline, select_account, no forced consent", async () => {
  for (const intent of [null, "signup", "login", "bogus"]) {
    const p = (await start(intent)).location.searchParams;
    assert.equal(p.get("scope"), `profile email ${SCOPE}`, String(intent));
    assert.equal(p.get("access_type"), "offline");
    assert.equal(p.get("prompt"), "select_account");
    assert.equal(p.get("include_granted_scopes"), null);
    assert.equal(p.get("redirect_uri"), `${BASE}/api/auth/google/callback`);
  }
});

test("login page: one Google button, no password form, no tabs", async () => {
  const html = await (await fetch(`${BASE}/login`)).text();
  assert.match(html, /Lanjutkan dengan Google/);
  assert.match(html, /href="\/api\/auth\/google"/);
  assert.match(html, /href="\/privacy"/);
  for (const gone of ['type="password"', 'name="email"', "Daftar dengan Google", "Sign up", "Sign in"]) {
    assert.ok(!html.includes(gone), gone);
  }
});

test("password sign-in is gone: posting credentials creates no session", async () => {
  await app.db.query(`INSERT INTO users (email, name, password_hash) VALUES ('legacy@pw.test', 'legacy', '$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234')`);
  const before = Number((await app.db.query(`SELECT count(*) FROM user_sessions`)).rows[0].count);
  for (const path of ["/login", "/"]) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: BASE },
      body: new URLSearchParams({ email: "legacy@pw.test", password: "whatever123", name: "x" })
    });
    assert.equal(cookieOf(res, "sid"), undefined, path);
  }
  assert.equal(Number((await app.db.query(`SELECT count(*) FROM user_sessions`)).rows[0].count), before);
});

test("new user via Google: account, encrypted token, spreadsheet, mirroring on, /connect step 1 done", async () => {
  const r = await signIn("signup", "c-newbie");
  assert.equal(r.status, 307);
  assert.equal(r.location, "/connect");
  const u = await userBy("newbie");
  assert.ok(u && r.sid);
  const c = await connection(u.id);
  assert.equal(c.status, "active");
  assert.equal(c.spreadsheet_id, "sheet-newbie");
  assert.equal(c.google_email, "newbie@gmail.test");
  assert.ok(!c.refresh_token_enc.includes("rt-newbie"));
  assert.equal(decryptToken(c.refresh_token_enc, ENC_KEY, `user:${u.id}`), "rt-newbie");
  assert.equal(u.sheets_mirror, true);
  assert.equal(u.onboarding_completed_at, null, "sign-up must not complete onboarding");

  const page = await fetch(`${BASE}/connect`, { headers: { cookie: `sid=${r.sid}`, "user-agent": IPHONE } });
  const html = await page.text();
  assert.match(html, /newbie@gmail\.test/);
  assert.match(html, /Langkah 2 dari 2/);
  assert.equal((await userBy("newbie")).onboarding_completed_at, null);
});

test("new user who unticked Drive (or got no refresh token): account, no connection", async () => {
  google.narrow.add("c-nodrive");
  google.noRefresh.add("c-norefresh");
  for (const x of ["nodrive", "norefresh"]) {
    const r = await signIn("signup", `c-${x}`);
    assert.equal(r.location, "/connect");
    const u = await userBy(x);
    assert.ok(u && r.sid, x);
    assert.equal(await connection(u.id), undefined, x);
    assert.equal(u.sheets_mirror, false, x);
  }
});

test("existing user: no new account, an active connection is never overwritten", async () => {
  const { rows } = await app.db.query(
    `INSERT INTO users (google_id, email, name, sheets_mirror) VALUES ('gid-veteran', 'veteran@gmail.test', 'veteran', TRUE) RETURNING id`
  );
  const id = rows[0].id;
  await app.db.query(
    `INSERT INTO sheets_connections (user_id, google_email, spreadsheet_id, spreadsheet_url, refresh_token_enc, status)
     VALUES ($1, 'old@gmail.test', 'sheet-old', 'https://old', 'v1:keep-me', 'active')`,
    [id]
  );
  const before = await countUsers();
  const calls = google.sheetCalls;
  const r = await signIn("signup", "c-veteran");
  assert.equal(r.status, 307);
  assert.equal(r.location, "/", "normal login, not onboarding");
  assert.ok(r.sid);
  assert.equal(await countUsers(), before);
  const c = await connection(id);
  assert.deepEqual([c.spreadsheet_id, c.refresh_token_enc, c.google_email], ["sheet-old", "v1:keep-me", "old@gmail.test"]);
  assert.equal(google.sheetCalls, calls, "no Google Sheets call");
});

test("existing user with no active connection gets one when Google returns a refresh token", async () => {
  await app.db.query(`INSERT INTO users (google_id, email, name) VALUES ('gid-loner', 'loner@gmail.test', 'loner')`);
  const before = await countUsers();
  const r = await signIn("signup", "c-loner");
  assert.equal(r.location, "/");
  assert.equal(await countUsers(), before);
  const u = await userBy("loner");
  assert.equal((await connection(u.id)).status, "active");
});

test("a Google 5xx while creating the spreadsheet still completes sign-up", async () => {
  google.failCreate.add("flaky");
  const r = await signIn("signup", "c-flaky");
  assert.equal(r.status, 307);
  assert.equal(r.location, "/connect");
  assert.ok(r.sid, "session issued");
  const u = await userBy("flaky");
  assert.ok(u);
  assert.equal(await connection(u.id), undefined);
});

test("tampered or missing state is rejected and creates nothing", async () => {
  const before = await countUsers();
  const cases = {
    "wrong state": ({ state, cookies }) => ({ state: state + "x", cookies }),
    "no cookies": ({ state }) => ({ state, cookies: [] })
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const r = await signIn("signup", "c-attacker", { mutate });
    assert.equal(r.location, "/login?error=oauth", name);
    assert.equal(r.sid, undefined, name);
  }
  assert.equal(await countUsers(), before);
  assert.equal(await userBy("attacker"), undefined);
});

test("existing user matched by verified email lands in the SAME account (google_id gets linked)", async () => {
  const { rows } = await app.db.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('matched@gmail.test', 'matched', 'legacy-hash') RETURNING id`
  );
  const before = await countUsers();
  const r = await signIn(null, "c-matched");
  assert.equal(r.location, "/");
  assert.ok(r.sid);
  assert.equal(await countUsers(), before, "no duplicate account");
  const u = await userBy("matched");
  assert.equal(u.id, rows[0].id);
  const who = (await app.db.query(`SELECT (sess->>'userId')::int AS id FROM user_sessions WHERE sid = $1`, [r.sid])).rows[0];
  assert.equal(who.id, rows[0].id);
});

test("existing user, Google returns no refresh token (already granted): logs in, nothing stored", async () => {
  await app.db.query(`INSERT INTO users (google_id, email, name) VALUES ('gid-regular', 'regular@gmail.test', 'regular')`);
  google.noRefresh.add("c-regular");
  const before = await countUsers();
  const calls = google.sheetCalls;
  const r = await signIn(null, "c-regular");
  assert.equal(r.status, 307);
  assert.equal(r.location, "/");
  assert.ok(r.sid);
  assert.equal(await countUsers(), before);
  assert.equal(await connection((await userBy("regular")).id), undefined);
  assert.equal(google.sheetCalls, calls);
});

test("logout still works: the session row is deleted and the user lands on /login", async () => {
  const { rows } = await app.db.query(
    `INSERT INTO users (email, name, onboarding_completed_at) VALUES ('bye@gmail.test', 'bye', NOW()) RETURNING id`
  );
  const sid = "f".repeat(64);
  await app.db.query(
    `INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2, NOW() + interval '1 hour')`,
    [sid, JSON.stringify({ userId: rows[0].id })]
  );
  const html = await (await fetch(`${BASE}/`, { headers: { cookie: `sid=${sid}` } })).text();
  const action = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
  assert.ok(action, "log out form found on the dashboard");
  const res = await fetch(`${BASE}/`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: `sid=${sid}`, origin: BASE },
    body: (() => {
      const f = new FormData(); // a no-JS form post is multipart
      f.append(action, "");
      return f;
    })()
  });
  assert.ok([303, 307].includes(res.status), String(res.status));
  assert.equal(new URL(res.headers.get("location"), BASE).pathname, "/login");
  assert.equal((await app.db.query(`SELECT 1 FROM user_sessions WHERE sid = $1`, [sid])).rowCount, 0);
});
