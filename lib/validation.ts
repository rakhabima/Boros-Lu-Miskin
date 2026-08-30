const MAX_AMOUNT = 1_000_000_000_000; // 1e12, comfortably above any real expense
const MAX_CATEGORY = 64;
const MAX_NOTES = 1000;

export type ParsedExpense =
  | { ok: false; message: string; field: string }
  | { ok: true; amount: number; category: string; notes: string | null };

/**
 * Validates an expense payload. `amount` arrives from a form or JSON so it may
 * be a string, a negative, NaN or Infinity — NUMERIC would happily store some
 * of those and reject others with a 500.
 */
export const parseExpenseBody = (body: unknown): ParsedExpense => {
  const b = (body ?? {}) as Record<string, unknown>;
  const amount = Number(b.amount);
  const category = typeof b.category === "string" ? b.category.trim() : "";
  const notes = typeof b.notes === "string" ? b.notes.trim() : "";

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return {
      ok: false,
      message: "Amount must be a positive number",
      field: "amount"
    };
  }
  if (!category || category.length > MAX_CATEGORY) {
    return { ok: false, message: "Category is required", field: "category" };
  }
  if (notes.length > MAX_NOTES) {
    return { ok: false, message: "Notes too long", field: "notes" };
  }

  return { ok: true, amount, category, notes: notes || null };
};
