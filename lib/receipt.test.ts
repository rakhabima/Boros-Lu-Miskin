import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractJson,
  toNumber,
  normalize,
  itemsString,
  buildNotes,
  imageType,
  sha256,
  dedupeKey,
  resolveDate,
  isPossibleDuplicate,
  jakartaToday,
  VISION_PROMPT
} from "./receipt.ts";

test("extractJson strips ```json fences and prose", () => {
  const r = extractJson('Ini hasilnya:\n```json\n{"merchant":"Indomaret","total":6000}\n```');
  assert.deepEqual(r, { merchant: "Indomaret", total: 6000 });
});

test("extractJson error carries the first 120 chars", () => {
  const text = "maaf ".repeat(50);
  assert.throws(() => extractJson(text), (e: Error) => e.message.endsWith(text.slice(0, 120)));
});

test("toNumber", () => {
  assert.equal(toNumber(15000.6), 15001);
  assert.equal(toNumber("Rp 15.000"), 15000);
  assert.equal(toNumber("abc"), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(NaN), 0);
});

test("normalize forces unknown category to Other", () => {
  assert.equal(normalize({ kategori: "Makanan & Minuman" }).category, "Other");
  assert.equal(normalize({ kategori: "Bills" }).category, "Bills");
  assert.equal(normalize({}).category, "Other");
});

test("normalize matches categories case-insensitively and trimmed", () => {
  assert.equal(normalize({ kategori: "food" }).category, "Food");
  assert.equal(normalize({ kategori: " Food " }).category, "Food");
  assert.equal(normalize({ kategori: "TRANSFER" }).category, "Transfer");
  assert.equal(normalize({ kategori: "foods" }).category, "Other");
});

test("toNumber drops a trailing decimal part", () => {
  assert.equal(toNumber("15.000,50"), 15000);
  assert.equal(toNumber("125000.50"), 125000);
  assert.equal(toNumber("15.000"), 15000);
  assert.equal(toNumber("Rp 1.250.000,5"), 1250000);
  assert.equal(toNumber("1,000,000"), 1000000);
});

test("isPossibleDuplicate: same amount and merchant, case-insensitive", () => {
  const r = { total: 12000, merchant: "Indomaret" };
  assert.equal(isPossibleDuplicate(r, [{ amount: 12000, merchant: " INDOMARET " }]), true);
  assert.equal(isPossibleDuplicate(r, [{ amount: 12001, merchant: "Indomaret" }]), false);
  assert.equal(isPossibleDuplicate(r, [{ amount: 12000, merchant: "Alfamart" }]), false);
  assert.equal(isPossibleDuplicate(r, [{ amount: 12000, merchant: null }]), false);
  assert.equal(isPossibleDuplicate(r, []), false);
  assert.equal(isPossibleDuplicate({ total: 5000, merchant: "" }, [{ amount: 5000, merchant: null }]), true);
});

test("normalize tolerates a bare transfer proof", () => {
  const r = normalize({ merchant: " BCA ", total: "250.000", tanggal: null });
  assert.deepEqual(r, { merchant: "BCA", date: null, total: 250000, category: "Other", items: [] });
});

test("normalize rejects malformed or impossible dates", () => {
  assert.equal(normalize({ tanggal: "16/10/2026" }).date, null);
  assert.equal(normalize({ tanggal: "2026-02-31" }).date, null);
  assert.equal(normalize({ tanggal: "2026-10-01" }).date, "2026-10-01");
});

test("itemsString skips missing qty or harga and nameless items", () => {
  const { items } = normalize({
    items: [{ nama: "Aqua", qty: 2, harga: 6000 }, { nama: "Roti", harga: "5.500" }, { nama: "Tas" , qty: 1 }, { qty: 3 }, null]
  });
  assert.equal(itemsString(items), "Aqua x2 (6000); Roti (5500); Tas x1");
});

test("buildNotes joins merchant and items and respects the notes limit", () => {
  assert.equal(
    buildNotes(normalize({ merchant: "Indomaret", items: [{ nama: "Aqua", qty: 2, harga: 6000 }] })),
    "Indomaret: Aqua x2 (6000)"
  );
  assert.equal(buildNotes(normalize({ merchant: "BCA" })), "BCA");
  assert.equal(buildNotes(normalize({ merchant: "x".repeat(2000) })).length, 1000);
});

test("imageType checks magic bytes", () => {
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(imageType(Buffer.from("GIF89a")), null);
  assert.equal(imageType(Buffer.alloc(0)), null);
});

test("token hashing is stable and does not echo the token", () => {
  const h = sha256("secret-token");
  assert.equal(h, sha256("secret-token"));
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, sha256("secret-tokeN"));
});

test("dedupe key depends only on the image bytes", () => {
  assert.equal(dedupeKey(Buffer.from("abc")), dedupeKey(Buffer.from("abc")));
  assert.notEqual(dedupeKey(Buffer.from("abc")), dedupeKey(Buffer.from("abd")));
});

test("jakartaToday crosses midnight at UTC+7", () => {
  assert.equal(jakartaToday(new Date("2026-10-15T17:30:00Z")), "2026-10-16");
  assert.equal(jakartaToday(new Date("2026-10-15T16:30:00Z")), "2026-10-15");
});

test("resolveDate sanity rules", () => {
  const today = "2026-10-16";
  assert.deepEqual(resolveDate(null, today), { date: today, createdAt: null, review: [] });
  assert.deepEqual(resolveDate(today, today), { date: today, createdAt: null, review: [] });
  assert.deepEqual(resolveDate("2026-10-10", today), { date: "2026-10-10", createdAt: "2026-10-10 12:00:00", review: [] });
  assert.deepEqual(resolveDate("2025-10-16", today).review, []);
  assert.deepEqual(resolveDate("2025-10-15", today), { date: today, createdAt: null, review: ["date_too_old"] });
  assert.deepEqual(resolveDate("2026-10-17", today), { date: today, createdAt: null, review: ["date_future"] });
});

test("prompt lists the built-in categories", () => {
  assert.match(VISION_PROMPT, /pilih tepat satu dari: Food, Transport, .*Other\)/);
});
