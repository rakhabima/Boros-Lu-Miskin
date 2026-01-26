import { Router, type Request, type Response } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const expensesRouter = Router();

/**
 * Create expense
 */
expensesRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { amount, category, notes } = req.body;

    if (!amount || !category) {
      const missingFields = [];
      if (!amount) missingFields.push("amount");
      if (!category) missingFields.push("category");
      return res.status(400).json({
        error: "Missing required fields",
        code: "VALIDATION_ERROR",
        details: { fields: missingFields }
      });
    }

    const result = await pool.query(
      `INSERT INTO expenses (amount, category, notes, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [amount, category, notes || null, req.user!.id]
    );

    res.json(result.rows[0]);
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
    res.json(result.rows);
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

    res.json({
      total: totalResult.rows[0].total,
      byCategory: byCategoryResult.rows
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
      return res.status(400).json({
        error: "Invalid expense id",
        code: "INVALID_ID",
        details: { field: "id" }
      });
    }

    const result = await pool.query(
      `DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Expense not found",
        code: "NOT_FOUND"
      });
    }

    res.json(result.rows[0]);
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
      return res.status(400).json({
        error: "Invalid expense id",
        code: "INVALID_ID",
        details: { field: "id" }
      });
    }

    const { amount, category, notes } = req.body;
    if (!amount || !category) {
      const missingFields = [];
      if (!amount) missingFields.push("amount");
      if (!category) missingFields.push("category");
      return res.status(400).json({
        error: "Missing required fields",
        code: "VALIDATION_ERROR",
        details: { fields: missingFields }
      });
    }

    const result = await pool.query(
      `UPDATE expenses
       SET amount = $1, category = $2, notes = $3
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [amount, category, notes || null, id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Expense not found",
        code: "NOT_FOUND"
      });
    }

    res.json(result.rows[0]);
  })
);
