// Local end-to-end test for the receipt flow, no dependencies.
//
//   node scripts/test-receipt.mjs <BASE_URL> <CONNECT_CODE> <IMAGE_PATH> [--twice]
//
// Trades a connect code for a device token (codes are single use and live
// 5 minutes, so one run = one new device), then POSTs the image to
// /api/receipts. To get a code on the Mac: open /connect, open DevTools →
// Network, tap Connect, and copy the `text=` value from the Location header
// of the /api/connect/approve response. --twice sends
// the same bytes again to exercise the duplicate path. The token is never
// printed.
import { readFile } from "node:fs/promises";

const [base, code, imagePath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const twice = process.argv.includes("--twice");
if (!base || !code || !imagePath) {
  console.error("usage: node scripts/test-receipt.mjs <BASE_URL> <CONNECT_CODE> <IMAGE_PATH> [--twice]");
  process.exit(1);
}

async function post(path, body, token) {
  const started = Date.now();
  const res = await fetch(new URL(path, base), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: JSON.stringify(body)
  });
  const ms = Date.now() - started;
  const json = await res.json().catch(() => null);
  return { status: res.status, ms, json };
}

const connect = await post("/api/connect/exchange", { code, device_name: "test-script" });
const { token, ...connectShown } = connect.json ?? {};
console.log(`connect  HTTP ${connect.status}  ${connect.ms} ms`, connectShown);
if (!token) process.exit(1);

const image = await readFile(imagePath);
// Declare PNG only for real PNG bytes; anything else goes as JPEG and the
// server's magic-byte check decides (so a HEIC or GIF tests the reject path).
const isPng = image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const body = { mime: isPng ? "image/png" : "image/jpeg", image: image.toString("base64") };
console.log(`image    ${imagePath}  ${(image.length / 1024).toFixed(0)} KB  sent as ${body.mime}`);

for (let i = 1; i <= (twice ? 2 : 1); i++) {
  const r = await post("/api/receipts", body, token);
  console.log(`receipt#${i} HTTP ${r.status}  ${r.ms} ms`);
  console.log(JSON.stringify(r.json, null, 2));
}
