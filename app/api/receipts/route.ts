import { after } from "next/server";
import { pool } from "@/lib/db";
import { config } from "@/lib/config";
import { deviceFromBearer, isInsecure, RECEIPT_SCOPE } from "@/lib/devices";
import { parseExpenseBody } from "@/lib/validation";
import { formatIDR } from "@/lib/format";
import {
  checkRateLimit,
  clientIp,
  RECEIPT_IP_LIMIT
} from "@/lib/rateLimit";
import { readReceipt, VisionError } from "@/lib/vision";
import { mirrorReceipt } from "@/lib/sheets";
import {
  buildNotes,
  dedupeKey,
  extractJson,
  imageType,
  jakartaToday,
  normalize,
  isPossibleDuplicate,
  LOW_CONFIDENCE,
  resolveDate,
  userCategories,
  visionPrompt
} from "@/lib/receipt";

// 45 s vision budget + DB round trips. 60 s fits every Vercel plan, Fluid or not.
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type Body = {
  ok: boolean;
  message: string;
  merchant?: string | null;
  total?: number | null;
  category?: string | null;
  date?: string | null;
  duplicate?: boolean;
  needs_review?: boolean;
};

// status/error_code go to receipt_attempts; http/body go to the Shortcut.
type Outcome = { status: string; error_code?: string; http: number; body: Body };

const fail = (http: number, status: string, error_code: string, message: string): Outcome => ({
  status,
  error_code,
  http,
  body: { ok: false, message }
});

const json = (http: number, body: Body) =>
  Response.json(
    {
      merchant: null,
      total: null,
      category: null,
      date: null,
      duplicate: false,
      needs_review: false,
      ...body
    },
    { status: http }
  );

export async function POST(req: Request) {
  if (isInsecure(req)) return json(403, { ok: false, message: "HTTPS wajib." });
  try {
    const ip = await clientIp();
    const byIp = await checkRateLimit(`rcpt:ip:${ip}`, RECEIPT_IP_LIMIT.limit, RECEIPT_IP_LIMIT.windowSec);
    if (!byIp.allowed) {
      return json(429, { ok: false, message: "Terlalu banyak kiriman. Coba lagi nanti." });
    }

    const device = await deviceFromBearer(req.headers.get("authorization"), RECEIPT_SCOPE);
    if (!device) {
      return json(401, { ok: false, message: "Perangkat belum terhubung atau sudah dicabut." });
    }

    const started = Date.now();
    const outcome = await handle(req, device).catch((err): Outcome => {
      console.error("[receipt] unexpected", err instanceof Error ? err.message : err);
      return fail(500, "failed", "server_error", "Terjadi kesalahan server. Coba lagi.");
    });

    // Privacy: only model, status, duration and error code are recorded.
    await pool
      .query(
        `INSERT INTO receipt_attempts (user_id, device_id, status, error_code, model, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [device.user_id, device.id, outcome.status, outcome.error_code ?? null, config.vision.model, Date.now() - started]
      )
      .catch((err) => console.error("[receipt] attempt log failed", err.message));

    return json(outcome.http, outcome.body);
  } catch (err) {
    console.error("[receipt] unexpected", err instanceof Error ? err.message : err);
    return json(500, { ok: false, message: "Terjadi kesalahan server. Coba lagi." });
  }
}

async function handle(req: Request, device: { id: number; user_id: number }): Promise<Outcome> {
  const userId = device.user_id;

  // Per user, not per device: a second phone must not double the allowance.
  const byUser = await checkRateLimit(`rcpt:u:${userId}`, config.vision.hourlyLimit, 60 * 60);
  if (!byUser.allowed) {
    return fail(429, "rate_limited", "user_rate_limit", "Terlalu banyak kiriman. Coba lagi nanti.");
  }

  // --- Input ---
  if (Number(req.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
    return fail(413, "rejected", "request_too_large", "Gambar terlalu besar.");
  }
  const image = await readImage(req);
  if (image === "too_large") return fail(413, "rejected", "image_too_large", "Gambar terlalu besar.");
  if (!image) return fail(400, "rejected", "bad_request", "Format kiriman salah.");
  const mime = imageType(image);
  if (!mime) return fail(415, "rejected", "bad_image_type", "Gambar harus JPEG atau PNG.");

  // --- Duplicate: checked before the model so a resend costs nothing ---
  const key = dedupeKey(image);
  const dup = await findDuplicate(userId, key);
  if (dup) return dup;

  // --- Daily cap (ai_usage, Jakarta day; the pool pins the session zone) ---
  const usage = await pool.query(
    `INSERT INTO ai_usage (user_id, usage_date, count) VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_usage.count + 1
     RETURNING count`,
    [userId]
  );
  if (usage.rows[0].count > config.vision.dailyCap) {
    return fail(429, "rate_limited", "daily_cap", "Batas harian struk tercapai. Coba lagi besok.");
  }

  // --- Read: the model picks from this user's categories (built-ins first) ---
  const custom = await pool.query(
    `SELECT DISTINCT category FROM expenses WHERE user_id = $1 LIMIT 100`,
    [userId]
  );
  const categories = userCategories(custom.rows.map((r) => r.category));
  let text: string;
  try {
    text = await readReceipt(image, mime, visionPrompt(categories));
  } catch (err) {
    const code = err instanceof VisionError ? err.code : "vision_error";
    return code === "timeout"
      ? fail(504, "failed", code, "Waktu habis saat membaca struk. Coba lagi.")
      : fail(502, "failed", code, "Gagal membaca struk. Coba lagi.");
  }

  let receipt;
  try {
    receipt = normalize(extractJson(text), categories);
  } catch {
    return fail(502, "failed", "parse_failed", "Struk tidak terbaca. Coba foto yang lebih jelas.");
  }

  const when = resolveDate(receipt.date, jakartaToday());
  const review = [...when.review];
  if (!receipt.merchant) review.push("no_merchant");
  if (!receipt.categoryMatched) review.push("category_unknown");
  if (receipt.confidence !== null && receipt.confidence < LOW_CONFIDENCE) review.push("low_confidence");
  const result = {
    merchant: receipt.merchant || null,
    total: receipt.total,
    category: receipt.category,
    date: when.date
  };

  // amount must be > 0 to pass manual-entry validation, so there is nothing
  // to save; tell the user to enter it by hand.
  if (receipt.total <= 0) {
    return {
      status: "failed",
      error_code: "no_total",
      http: 422,
      body: { ok: false, message: "Total tidak terbaca. Catat manual ya.", ...result, needs_review: true }
    };
  }

  // --- Save, through the same validation as manual entry ---
  const parsed = parseExpenseBody({
    amount: receipt.total,
    category: receipt.category,
    notes: buildNotes(receipt)
  });
  if (!parsed.ok) return fail(422, "failed", `invalid_${parsed.field}`, "Data struk tidak valid. Catat manual ya.");

  const recent = await pool.query(
    `SELECT amount, extraction->>'merchant' AS merchant, to_char(created_at, 'YYYY-MM-DD') AS date
     FROM expenses
     WHERE user_id = $1 AND source = 'receipt' AND inserted_at > NOW() - INTERVAL '10 minutes'`,
    [userId]
  );
  const similar = isPossibleDuplicate({ ...receipt, date: when.date }, recent.rows);
  if (similar) review.push("possible_duplicate");

  const needsReview = review.length > 0;
  const { rows } = await pool.query(
    `INSERT INTO expenses
       (amount, category, notes, user_id, created_at, source, needs_review, dedupe_key, device_id, extraction)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, NOW()), 'receipt', $6, $7, $8, $9)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      parsed.amount,
      parsed.category,
      parsed.notes,
      userId,
      when.createdAt,
      needsReview,
      key,
      device.id,
      JSON.stringify({
        model: config.vision.model,
        review,
        merchant: receipt.merchant,
        items: receipt.items,
        confidence: receipt.confidence
      })
    ]
  );
  // Lost a race with an identical concurrent request.
  if (!rows[0]) return (await findDuplicate(userId, key))!;

  after(() =>
    mirrorReceipt(userId, {
      date: when.date,
      merchant: receipt.merchant,
      amount: parsed.amount,
      category: parsed.category,
      notes: parsed.notes,
      needs_review: needsReview
    })
  );

  const label = `${receipt.merchant || "Transaksi"} ${formatIDR(receipt.total)}`;
  return {
    status: "saved",
    http: 200,
    body: {
      ok: true,
      message: similar
        ? `Tersimpan, tapi mirip struk yang baru saja disimpan: ${label}. Cek dan hapus jika dobel.`
        : needsReview
          ? `Tersimpan, perlu dicek: ${label}`
          : `Tersimpan: ${label} (${receipt.category})`,
      ...result,
      needs_review: needsReview
    }
  };
}

async function findDuplicate(userId: number, key: string): Promise<Outcome | null> {
  const { rows } = await pool.query(
    `SELECT amount, category, needs_review, extraction->>'merchant' AS merchant,
            to_char(created_at, 'YYYY-MM-DD') AS date
     FROM expenses WHERE user_id = $1 AND dedupe_key = $2`,
    [userId, key]
  );
  if (!rows[0]) return null;
  return {
    status: "duplicate",
    http: 200,
    body: {
      ok: true,
      message: "Struk ini sudah pernah disimpan.",
      merchant: rows[0].merchant || null,
      total: rows[0].amount,
      category: rows[0].category,
      date: rows[0].date,
      duplicate: true,
      needs_review: rows[0].needs_review
    }
  };
}

/** Multipart (field "image") or JSON {image: base64}. The magic-byte check later decides the type. */
async function readImage(req: Request): Promise<Buffer | "too_large" | null> {
  if ((req.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    const file = (await req.formData().catch(() => null))?.get("image");
    if (!(file instanceof Blob)) return null;
    if (file.size > MAX_IMAGE_BYTES) return "too_large";
    return Buffer.from(await file.arrayBuffer());
  }
  const raw = await req.text();
  if (raw.length > MAX_REQUEST_BYTES) return "too_large";
  let payload: { image?: unknown } | null = null;
  try {
    payload = JSON.parse(raw);
  } catch {}
  if (typeof payload?.image !== "string") return null;
  const image = Buffer.from(payload.image.replace(/\s/g, ""), "base64");
  return image.length > MAX_IMAGE_BYTES ? "too_large" : image;
}
