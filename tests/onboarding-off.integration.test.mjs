// Gate OFF (flag not "true"): behaviour is exactly as before the gate existed.
//
//   npm run test:integration   (stop `npm run dev` first; see harness.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, createUser, sessionFor, setupApp } from "./harness.mjs";

setupApp(() => ({ ONBOARDING_GATE_ENABLED: "false", SHORTCUT_INSTALL_URL: "https://www.icloud.com/shortcuts/x" }));

test("gate off: a brand-new, un-onboarded user reaches the dashboard", async () => {
  const sid = await sessionFor(await createUser("flag-off"));
  for (const path of ["/", "/insights", "/devices"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie: `sid=${sid}` } });
    assert.equal(res.status, 200, path);
  }
});
