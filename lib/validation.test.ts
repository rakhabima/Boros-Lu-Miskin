import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExpenseBody } from "./validation.ts";

const valid = { amount: 50000, category: "Food", notes: "Lunch" };

test("accepts a valid expense", () => {
  const r = parseExpenseBody(valid);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.amount, 50000);
  assert.equal(r.category, "Food");
  assert.equal(r.notes, "Lunch");
});

test("accepts a numeric string amount", () => {
  const r = parseExpenseBody({ ...valid, amount: "50000" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.amount, 50000);
});

test("trims category and notes", () => {
  const r = parseExpenseBody({ ...valid, category: "  Food  ", notes: "  hi  " });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.category, "Food");
  assert.equal(r.notes, "hi");
});

test("normalises empty notes to null", () => {
  const r = parseExpenseBody({ ...valid, notes: "   " });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.notes, null);
});

test("normalises missing notes to null", () => {
  const r = parseExpenseBody({ amount: 1, category: "Food" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.notes, null);
});

// Amount rejections — this is the money path.
for (const [label, amount] of [
  ["non-numeric", "abc"],
  ["NaN", NaN],
  ["Infinity", Infinity],
  ["-Infinity", -Infinity],
  ["zero", 0],
  ["negative", -1],
  ["above MAX_AMOUNT", 1_000_000_000_001],
  ["null", null],
  ["undefined", undefined]
] as const) {
  test(`rejects ${label} amount`, () => {
    const r = parseExpenseBody({ ...valid, amount });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.field, "amount");
  });
}

test("accepts exactly MAX_AMOUNT", () => {
  const r = parseExpenseBody({ ...valid, amount: 1_000_000_000_000 });
  assert.equal(r.ok, true);
});

test("rejects empty category", () => {
  const r = parseExpenseBody({ ...valid, category: "   " });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.field, "category");
});

test("rejects non-string category", () => {
  const r = parseExpenseBody({ ...valid, category: 42 });
  assert.equal(r.ok, false);
});

test("rejects category over 64 chars", () => {
  const r = parseExpenseBody({ ...valid, category: "x".repeat(65) });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.field, "category");
});

test("accepts category at exactly 64 chars", () => {
  const r = parseExpenseBody({ ...valid, category: "x".repeat(64) });
  assert.equal(r.ok, true);
});

test("rejects notes over 1000 chars", () => {
  const r = parseExpenseBody({ ...valid, notes: "x".repeat(1001) });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.field, "notes");
});

test("accepts notes at exactly 1000 chars", () => {
  const r = parseExpenseBody({ ...valid, notes: "x".repeat(1000) });
  assert.equal(r.ok, true);
});

test("rejects null body without throwing", () => {
  const r = parseExpenseBody(null);
  assert.equal(r.ok, false);
});
