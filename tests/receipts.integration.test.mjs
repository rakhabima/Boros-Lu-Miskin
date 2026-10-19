// End-to-end tests for connect + receipts, through the real route handlers.
//
//   npm run test:integration   (stop `npm run dev` first; see harness.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  app,
  BASE,
  countExpenses,
  createUser,
  exchange,
  insertCode,
  jpeg,
  modelReply,
  postReceipt,
  sessionFor,
  sha,
  tokenFor,
  setupApp
} from "./harness.mjs";

const HOURLY_LIMIT = 5;
setupApp(() => ({ RECEIPT_HOURLY_LIMIT: String(HOURLY_LIMIT) }));

// --- connect ---------------------------------------------------------------

test("approve: refuses cross-site or Origin-less POSTs (CSRF)", async () => {
  const sid = await sessionFor(await createUser("csrf"));
  for (const origin of [null, "http://evil.example"]) {
    const res = await fetch(`${BASE}/api/connect/approve`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: `sid=${sid}`, ...(origin && { origin }) }
    });
    assert.equal(res.status, 403, `origin ${origin}`);
  }
});

test("approve: logged-out user is sent to login and back to /connect", async () => {
  const res = await fetch(`${BASE}/api/connect/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: BASE }
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/login?next=/connect");
});

test("approve → exchange: one-time code becomes a token stored only as a hash", async () => {
  const userId = await createUser("approve");
  const res = await fetch(`${BASE}/api/connect/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: `sid=${await sessionFor(userId)}`, origin: BASE }
  });
  assert.equal(res.status, 303);
  const location = res.headers.get("location");
  assert.match(location, /^shortcuts:\/\/run-shortcut\?name=Simpan%20Struk&input=text&text=[\w-]{43}$/);
  const code = new URL(location).searchParams.get("text");

  const first = await exchange(code);
  assert.equal(first.status, 200);
  assert.match(first.json.token, /^blm_[\w-]{43}$/);

  const { rows } = await app.db.query(`SELECT * FROM devices WHERE user_id = $1`, [userId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, sha(first.json.token));
  assert.equal(rows[0].token_prefix, first.json.token.slice(0, 8));
  assert.equal(rows[0].scope, "receipts:create");
  assert.equal(rows[0].name, "Test iPhone");
  assert.ok(!JSON.stringify(rows[0]).includes(first.json.token), "raw token stored");
  const codes = await app.db.query(`SELECT * FROM device_connect_codes WHERE user_id = $1`, [userId]);
  assert.ok(!JSON.stringify(codes.rows).includes(code), "raw code stored");

  const again = await exchange(code);
  assert.equal(again.status, 400);
  assert.equal(again.json.ok, false);
});

test("exchange: an expired code is refused with the same generic message", async () => {
  const userId = await createUser("expired");
  const used = await exchange("not-a-real-code");
  const expired = await exchange(await insertCode(userId, "-1 second"));
  assert.equal(expired.status, 400);
  assert.equal(expired.json.message, used.json.message);
  assert.equal(expired.json.token, undefined);
});

test("exchange: concurrent exchanges of one code, exactly one wins", async () => {
  const userId = await createUser("race");
  const code = await insertCode(userId);
  const results = await Promise.all(Array.from({ length: 5 }, () => exchange(code)));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400, 400, 400]);
  const { rows } = await app.db.query(`SELECT count(*) FROM devices WHERE user_id = $1`, [userId]);
  assert.equal(Number(rows[0].count), 1);
});

// --- receipts --------------------------------------------------------------

test("receipts: revoked, wrongly scoped and unknown tokens are rejected", async () => {
  const userId = await createUser("revoked");
  const revoked = await tokenFor(userId);
  await app.db.query(`UPDATE devices SET revoked_at = NOW() WHERE token_hash = $1`, [sha(revoked)]);
  const scoped = await tokenFor(userId);
  await app.db.query(`UPDATE devices SET scope = 'other' WHERE token_hash = $1`, [sha(scoped)]);

  for (const token of [revoked, scoped, "blm_" + randomBytes(32).toString("base64url")]) {
    const r = await postReceipt(token, jpeg());
    assert.equal(r.status, 401);
    assert.equal(r.json.ok, false);
  }
  assert.equal(await countExpenses(userId), 0);
});

test("receipts: token A can never write to user B", async () => {
  const a = await createUser("alice");
  const b = await createUser("bob");
  const tokenA = await tokenFor(a);

  const viaJson = await postReceipt(tokenA, jpeg(), { extra: { user_id: b, userId: b } });
  const viaForm = await postReceipt(tokenA, jpeg(), { multipart: true, extra: { user_id: b } });
  assert.equal(viaJson.status, 200);
  assert.equal(viaForm.status, 200);
  assert.equal(await countExpenses(a), 2);
  assert.equal(await countExpenses(b), 0);
});

test("receipts: same image is a duplicate; a new screenshot of it is saved and flagged", async () => {
  const userId = await createUser("dedupe");
  const token = await tokenFor(userId);
  const image = jpeg();

  const first = await postReceipt(token, image);
  assert.equal(first.status, 200);
  assert.equal(first.json.ok, true);
  assert.equal(first.json.needs_review, false);
  const callsAfterFirst = app.modelCalls;

  const second = await postReceipt(token, image);
  assert.equal(second.json.duplicate, true);
  assert.equal(app.modelCalls, callsAfterFirst, "duplicate must not call the model");

  const similar = await postReceipt(token, jpeg());
  assert.equal(similar.status, 200);
  assert.equal(similar.json.duplicate, false);
  assert.equal(similar.json.needs_review, true);
  assert.equal(await countExpenses(userId), 2);
  const { rows } = await app.db.query(
    `SELECT extraction FROM expenses WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  assert.ok(rows[0].extraction.review.includes("possible_duplicate"));
});

test("receipts: low confidence or unknown category → Other + needs_review", async () => {
  const userId = await createUser("unsure");
  const token = await tokenFor(userId);
  app.reply = modelReply({ kategori: "Something Else", confidence: 0.3, merchant: "Warung" });

  const r = await postReceipt(token, jpeg());
  assert.equal(r.status, 200);
  assert.equal(r.json.category, "Other");
  assert.equal(r.json.needs_review, true);
  const { rows } = await app.db.query(`SELECT extraction FROM expenses WHERE user_id = $1`, [userId]);
  assert.deepEqual(rows[0].extraction.review.sort(), ["category_unknown", "low_confidence"]);
});

test("receipts: the model may pick the user's own category", async () => {
  const userId = await createUser("custom");
  await app.db.query(`INSERT INTO expenses (amount, category, user_id) VALUES (1, 'Kopi', $1)`, [userId]);
  const token = await tokenFor(userId);
  app.reply = modelReply({ kategori: "kopi", merchant: "Kopi Kenangan" });

  const r = await postReceipt(token, jpeg());
  assert.equal(r.json.category, "Kopi");
  assert.equal(r.json.needs_review, false);
});

test(`receipts: rate limit is per user (${HOURLY_LIMIT}/hour) across devices`, async () => {
  const userId = await createUser("busy");
  const tokens = [await tokenFor(userId), await tokenFor(userId)];
  for (let i = 0; i < HOURLY_LIMIT; i++) {
    app.reply = modelReply({ total: String(1000 + i), merchant: `M${i}` });
    const r = await postReceipt(tokens[i % 2], jpeg());
    assert.equal(r.status, 200, `request ${i + 1}`);
  }
  const blocked = await postReceipt(tokens[1], jpeg());
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.ok, false);
  const { rows } = await app.db.query(
    `SELECT error_code FROM receipt_attempts WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  assert.equal(rows[0].error_code, "user_rate_limit");
});
