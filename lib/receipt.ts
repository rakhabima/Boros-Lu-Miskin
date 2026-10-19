// Pure receipt logic, ported from the Google Apps Script. No DB, no Next
// imports, so `node --test` can load it directly.
import { createHash } from "node:crypto";
import { BUILT_IN_CATEGORIES } from "./format.ts";
import { MAX_NOTES } from "./validation.ts";

/** The ported Apps Script prompt; only the category list and `confidence` are new. */
export const visionPrompt = (categories: string[]) =>
  "Baca struk atau bukti transaksi pada gambar ini. Balas HANYA dengan satu objek JSON, tanpa teks lain, dengan field: merchant (string), tanggal (string YYYY-MM-DD, atau null jika tidak tercantum di gambar), total (angka rupiah tanpa titik atau simbol), kategori (pilih tepat satu dari: " +
  categories.join(", ") +
  "), items (array objek {nama, qty, harga}, boleh kosong jika tidak ada rincian), confidence (angka 0 sampai 1, seberapa yakin bacaanmu benar). Jangan menebak tanggal.";

/** Below this the expense is saved but flagged for review. */
export const LOW_CONFIDENCE = 0.6;

/**
 * Built-ins first, then the user's own categories (from their expenses).
 * Custom names go into the prompt, so keep only plain ones: anything with
 * punctuation that could break the list, or a case-insensitive repeat, is dropped.
 */
export function userCategories(custom: string[]): string[] {
  const seen = new Set(BUILT_IN_CATEGORIES.map((c) => c.toLowerCase()));
  const extra = custom
    .map((c) => c.trim())
    .filter((c) => /^[\p{L}\p{N} &/-]{1,64}$/u.test(c))
    .filter((c) => !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
  return [...BUILT_IN_CATEGORIES, ...extra.slice(0, 30)];
}

export const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

/** Models often wrap the object in ```json fences or prose. */
export function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`No JSON object in model reply: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  // Drop a trailing decimal part first so "15.000,50" is 15000, not 1500050.
  // Three digits after the separator ("15.000") is a thousands group, kept.
  const s = String(v ?? "").trim().replace(/[.,]\d{1,2}$/, "");
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Detects the real image type from magic bytes; the declared mime is not trusted. */
export function imageType(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && png.every((b, i) => buf[i] === b)) return "image/png";
  return null;
}

/** Same bytes, same user → same key. Backed by a unique index on expenses. */
export const dedupeKey = (image: Buffer) => sha256(image);

/** yyyy-MM-dd for `now` in Asia/Jakarta. */
export const jakartaToday = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);

const isRealDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

export type Item = { nama: string; qty: number | null; harga: number | null };

export type Receipt = {
  merchant: string;
  date: string | null; // yyyy-MM-dd if present and well-formed
  total: number;
  category: string;
  /** false when the model's category was missing or not in the user's list. */
  categoryMatched: boolean;
  items: Item[];
  /** 0..1 as reported by the model; null if missing or out of range. */
  confidence: number | null;
};

/** Tolerates missing or empty fields: transfer proofs have no date or items. */
export function normalize(
  raw: Record<string, unknown>,
  categories: string[] = BUILT_IN_CATEGORIES
): Receipt {
  const opt = (v: unknown) => (v === null || v === undefined || v === "" ? null : toNumber(v));
  const items = Array.isArray(raw.items) ? raw.items : [];
  const date = typeof raw.tanggal === "string" ? raw.tanggal.trim() : "";
  const kategori = typeof raw.kategori === "string" ? raw.kategori.trim().toLowerCase() : "";
  const matched = categories.find((c) => c.toLowerCase() === kategori);
  const conf = typeof raw.confidence === "string" ? Number(raw.confidence) : raw.confidence;
  return {
    merchant: String(raw.merchant ?? "").trim(),
    date: isRealDate(date) ? date : null,
    total: toNumber(raw.total),
    category: matched ?? "Other",
    categoryMatched: matched !== undefined,
    confidence: typeof conf === "number" && conf >= 0 && conf <= 1 ? conf : null,
    items: items
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => ({ nama: String(i.nama ?? "").trim(), qty: opt(i.qty), harga: opt(i.harga) }))
      .filter((i) => i.nama)
  };
}

/**
 * Soft duplicate: a fresh screenshot of the same transaction has different
 * bytes (status bar clock), so the image hash misses it. Same amount, same
 * merchant (case-insensitive) and same date as a receipt saved moments ago is
 * a hint, not a rejection. The caller supplies `recent` already limited to the
 * time window.
 */
export const isPossibleDuplicate = (
  r: { total: number; merchant: string; date: string },
  recent: Array<{ amount: number; merchant: string | null; date: string }>
) =>
  recent.some(
    (e) =>
      Number(e.amount) === r.total &&
      e.date === r.date &&
      (e.merchant ?? "").trim().toLowerCase() === r.merchant.trim().toLowerCase()
  );

/** "nama xQty (harga)" joined with "; ", skipping a missing qty or harga. */
export const itemsString = (items: Item[]) =>
  items
    .map((i) => i.nama + (i.qty !== null ? ` x${i.qty}` : "") + (i.harga !== null ? ` (${i.harga})` : ""))
    .join("; ");

export function buildNotes(r: Receipt): string {
  const items = itemsString(r.items);
  const notes = r.merchant && items ? `${r.merchant}: ${items}` : r.merchant || items;
  return notes.slice(0, MAX_NOTES);
}

/**
 * created_at for the receipt date. null = let the DB use NOW().
 * Missing or today → now. Past (≤ 1 year) → noon Jakarta that day. Future or
 * older than a year → treated as today and flagged for review.
 */
export function resolveDate(
  date: string | null,
  today: string
): { date: string; createdAt: string | null; review: string[] } {
  if (!date || date === today) return { date: today, createdAt: null, review: [] };
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  if (date > today) return { date: today, createdAt: null, review: ["date_future"] };
  if (date < yearAgo) return { date: today, createdAt: null, review: ["date_too_old"] };
  return { date, createdAt: `${date} 12:00:00`, review: [] };
}
