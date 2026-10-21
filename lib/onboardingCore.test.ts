import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import {
  connectUrl,
  gateApplies,
  gateEnabledFrom,
  isIphone,
  returnFromState,
  safeSheetsReturn,
  stateWithReturn
} from "./onboardingCore.ts";
import { qrSvg } from "./qr.ts";
import { signState, verifyState } from "./sheetsCore.ts";

test("return path allowlist: only /connect and /devices, never a free URL", () => {
  assert.equal(safeSheetsReturn("/connect"), "/connect");
  assert.equal(safeSheetsReturn("/devices"), "/devices");
  for (const bad of ["https://evil.example", "//evil.example", "/api/sheets/disconnect", "/connect/../x", "", null, undefined, 5]) {
    assert.equal(safeSheetsReturn(bad), "/devices", String(bad));
  }
});

test("return path survives the signed state and cannot be swapped", () => {
  const state = stateWithReturn("abc_DEF-123", "/connect");
  const cookie = signState(state, 7, "s3cret");
  assert.equal(verifyState(cookie, state, 7, "s3cret"), true);
  assert.equal(returnFromState(state), "/connect");
  // Dropping the suffix from the echoed state no longer matches the cookie.
  assert.equal(verifyState(cookie, "abc_DEF-123", 7, "s3cret"), false);
  assert.equal(returnFromState(stateWithReturn("abc", "/devices")), "/devices");
  assert.equal(returnFromState(null), "/devices");
});

test("gate: needs the exact flag AND a Shortcut URL, and only until completion", () => {
  assert.equal(gateEnabledFrom("true", "https://icloud.test/s"), true);
  assert.equal(gateEnabledFrom("true", ""), false);
  for (const flag of [undefined, "", "false", "1", "TRUE"]) assert.equal(gateEnabledFrom(flag, "https://x"), false);
  assert.equal(gateApplies(true, null), true);
  assert.equal(gateApplies(true, "2026-10-01"), false);
  assert.equal(gateApplies(false, null), false);
});

test("isIphone looks only for an iPhone user agent", () => {
  assert.equal(isIphone("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
  assert.equal(isIphone("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);
  assert.equal(isIphone(null), false);
});

test("QR encodes the absolute /connect URL (APP_BASE_URL first, request origin as fallback)", async () => {
  assert.equal(connectUrl("https://app.example/", "http://localhost:3000"), "https://app.example/connect");
  assert.equal(connectUrl("", "http://localhost:3000"), "http://localhost:3000/connect");
  assert.equal(await qrSvg(connectUrl("https://app.example", "x")), await QRCode.toString("https://app.example/connect", { type: "svg", margin: 1 }));
  assert.notEqual(await qrSvg("https://app.example/connect"), await qrSvg("https://app.example/other"));
});
