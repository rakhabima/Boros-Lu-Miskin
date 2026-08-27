import { Router, type Request, type Response } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { respondError, respondSuccess } from "../utils/response.js";

export const expensesRouter = Router();

const MAX_AMOUNT = 1_000_000_000_000; // 1e12, comfortably above any real expense
const MAX_CATEGORY = 64;
const MAX_NOTES = 1000;

/**
 * Validates the shared expense body. Returns an error payload or the clean row.
 * `amount` arrives as JSON so it may be a string, a negative, NaN or Infinity —
 * NUMERIC would happily store some of those and reject others with a 500.
 */
type ParsedExpense =
  | { ok: false; code: string; message: string; details: unknown }
  | { ok: true; amount: number; category: string; notes: string | null };

const parseExpenseBody = (body: any): ParsedExpense => {
  const amount = Number(body?.amount);
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return {
      ok: false,
      code: "EXPENSE_INVALID_AMOUNT",
      message: "Amount must be a positive number",
      details: { field: "amount", max: MAX_AMOUNT }
    };
  }
  if (!category || category.length > MAX_CATEGORY) {
    return {
      ok: false,
      code: "EXPENSE_INVALID_CATEGORY",
      message: "Category is required",
      details: { field: "category", maxLength: MAX_CATEGORY }
    };
  }
  if (notes.length > MAX_NOTES) {
    return {
      ok: false,
      code: "EXPENSE_INVALID_NOTES",
      message: "Notes too long",
      details: { field: "notes", maxLength: MAX_NOTES }
    };
  }

  return { ok: true, amount, category, notes: notes || null };
};

/**
 * Create expense
 */
expensesRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseExpenseBody(req.body);
    if (!parsed.ok) {
      return respondError(res, req, {
        status: 400,
        code: parsed.code,
        message: parsed.message,
        details: parsed.details,
        authenticated: true
      });
    }

    const result = await pool.query(
      `INSERT INTO expenses (amount, category, notes, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [parsed.amount, parsed.category, parsed.notes, req.user!.id]
    );

    return respondSuccess(res, req, {
      status: 201,
      code: "EXPENSE_CREATE_SUCCESS",
      message: "Expense created successfully",
      data: { expense: result.rows[0] },
      authenticated: true
    });
  })
);

/**
 * Get all expenses (most recent first)
 */
expensesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT id, amount, category, notes, created_at
       FROM expenses
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.id]
    );
    return respondSuccess(res, req, {
      code: "EXPENSE_LIST_SUCCESS",
      message: "Expenses retrieved successfully",
      data: { expenses: result.rows },
      authenticated: true
    });
  })
);

/**
 * Summary
 */
expensesRouter.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE user_id = $1`,
      [req.user!.id]
    );

    const byCategoryResult = await pool.query(
      `SELECT category, SUM(amount) AS total
       FROM expenses
       WHERE user_id = $1
       GROUP BY category`,
      [req.user!.id]
    );

    return respondSuccess(res, req, {
      code: "EXPENSE_SUMMARY_SUCCESS",
      message: "Expense summary retrieved successfully",
      data: {
        total: totalResult.rows[0].total,
        byCategory: byCategoryResult.rows
      },
      authenticated: true
    });
  })
);

/**
 * Delete expense
 */
expensesRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return respondError(res, req, {
        status: 400,
        code: "EXPENSE_DELETE_INVALID_ID",
        message: "Invalid expense id",
        details: { field: "id" },
        authenticated: true
      });
    }

    const result = await pool.query(
      `DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return respondError(res, req, {
        status: 404,
        code: "EXPENSE_DELETE_NOT_FOUND",
        message: "Expense not found",
        details: { id },
        authenticated: true
      });
    }

    return respondSuccess(res, req, {
      code: "EXPENSE_DELETE_SUCCESS",
      message: "Expense deleted successfully",
      data: { expense: result.rows[0] },
      authenticated: true
    });
  })
);

/**
 * Update expense
 */
expensesRouter.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return respondError(res, req, {
        status: 400,
        code: "EXPENSE_UPDATE_INVALID_ID",
        message: "Invalid expense id",
        details: { field: "id" },
        authenticated: true
      });
    }

    const parsed = parseExpenseBody(req.body);
    if (!parsed.ok) {
      return respondError(res, req, {
        status: 400,
        code: parsed.code,
        message: parsed.message,
        details: parsed.details,
        authenticated: true
      });
    }

    const result = await pool.query(
      `UPDATE expenses
       SET amount = $1, category = $2, notes = $3
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [parsed.amount, parsed.category, parsed.notes, id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return respondError(res, req, {
        status: 404,
        code: "EXPENSE_UPDATE_NOT_FOUND",
        message: "Expense not found",
        details: { id },
        authenticated: true
      });
    }

    return respondSuccess(res, req, {
      code: "EXPENSE_UPDATE_SUCCESS",
      message: "Expense updated successfully",
      data: { expense: result.rows[0] },
      authenticated: true
    });
  })
);
