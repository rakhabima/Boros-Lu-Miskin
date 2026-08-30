import { pool } from "./db";
import type { Expense } from "@/types";

type ValidExpense = { amount: number; category: string; notes: string | null };

export async function listExpenses(userId: number): Promise<Expense[]> {
  const { rows } = await pool.query(
    `SELECT id, amount, category, notes, created_at
     FROM expenses
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function createExpense(
  userId: number,
  e: ValidExpense
): Promise<Expense> {
  const { rows } = await pool.query(
    `INSERT INTO expenses (amount, category, notes, user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, amount, category, notes, created_at`,
    [e.amount, e.category, e.notes, userId]
  );
  return rows[0];
}

export async function updateExpense(
  userId: number,
  id: number,
  e: ValidExpense
): Promise<Expense | null> {
  const { rows } = await pool.query(
    `UPDATE expenses SET amount = $1, category = $2, notes = $3
     WHERE id = $4 AND user_id = $5
     RETURNING id, amount, category, notes, created_at`,
    [e.amount, e.category, e.notes, id, userId]
  );
  return rows[0] ?? null;
}

export async function deleteExpense(
  userId: number,
  id: number
): Promise<Expense | null> {
  const { rows } = await pool.query(
    `DELETE FROM expenses WHERE id = $1 AND user_id = $2
     RETURNING id, amount, category, notes, created_at`,
    [id, userId]
  );
  return rows[0] ?? null;
}
