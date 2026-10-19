import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  classify,
  decryptToken,
  encryptToken,
  parseEncKey,
  sheetRow,
  SHEET_HEADER,
  signState,
  verifyState
} from "./sheetsCore.ts";

const key = randomBytes(32);

test("token encryption round-trips", () => {
  const enc = encryptToken("1//refresh-token", key, "user:1");
  assert.equal(decryptToken(enc, key, "user:1"), "1//refresh-token");
  assert.ok(!enc.includes("refresh-token"));
});

test("ciphertext differs per encryption of the same token", () => {
  assert.notEqual(encryptToken("same", key, "user:1"), encryptToken("same", key, "user:1"));
});

test("decryption fails with another key, another user, or tampering", () => {
  const enc = encryptToken("secret", key, "user:1");
  assert.throws(() => decryptToken(enc, randomBytes(32), "user:1"));
  assert.throws(() => decryptToken(enc, key, "user:2"));
  const raw = Buffer.from(enc.slice(3), "base64");
  raw[raw.length - 1] ^= 1;
  assert.throws(() => decryptToken("v1:" + raw.toString("base64"), key, "user:1"));
});

test("parseEncKey accepts exactly 32 bytes of base64", () => {
  assert.equal(parseEncKey(randomBytes(32).toString("base64")).length, 32);
  for (const bad of [undefined, "", randomBytes(16).toString("base64"), "not base64!"]) {
    assert.throws(() => parseEncKey(bad), /openssl rand -base64 32/);
  }
});

test("verifyState accepts only our cookie for this user and this state", () => {
  const cookie = signState("abc", 7, "s3cret");
  assert.equal(verifyState(cookie, "abc", 7, "s3cret"), true);
  assert.equal(verifyState(cookie, "abd", 7, "s3cret"), false, "state mismatch");
  assert.equal(verifyState(cookie, "abc", 8, "s3cret"), false, "other user");
  assert.equal(verifyState(cookie, "abc", 7, "other"), false, "forged signature");
  assert.equal(verifyState(undefined, "abc", 7, "s3cret"), false, "no cookie");
  assert.equal(verifyState(cookie, null, 7, "s3cret"), false, "no state");
  assert.equal(verifyState("abc.7.forged", "abc", 7, "s3cret"), false);
});

test("sheetRow keeps column order and escapes formula-like text", () => {
  const base = { recorded_at: "2026-10-16T17:30:05Z", date: "2026-10-16", merchant: "Indomaret", amount: 45000, category: "Food", notes: null, needs_review: false };
  assert.equal(SHEET_HEADER.length, 7);
  assert.deepEqual(sheetRow(base), ["2026-10-17 00:30:05", "2026-10-16", "Indomaret", "Food", 45000, "", false]);
  const row = sheetRow({ ...base, merchant: "=IMPORTXML(1)", notes: "+62 811", needs_review: true });
  assert.equal(row[2], "'=IMPORTXML(1)");
  assert.equal(row[5], "'+62 811");
  assert.equal(row.length, SHEET_HEADER.length);
});

test("classify Google failures", () => {
  assert.equal(classify(400, "invalid_grant"), "reconnect");
  assert.equal(classify(401), "reconnect");
  assert.equal(classify(403), "reconnect");
  assert.equal(classify(404), "missing");
  assert.equal(classify(429), "retry");
  assert.equal(classify(503), "retry");
  assert.equal(classify(0), "retry");
  assert.equal(classify(400), "fail");
});
