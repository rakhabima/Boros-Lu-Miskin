import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

/**
 * Create expense
 */
app.post("/expenses", asyncHandler(async (req, res) => {
    const { amount, category, notes } = req.body;

    if (!amount || !category) {
        return res.status(400).json({ error: "amount and category are required" });
    }

    const result = await pool.query(
        `INSERT INTO expenses (amount, category, notes)
     VALUES ($1, $2, $3)
     RETURNING *`,
        [amount, category, notes || null]
    );

    res.json(result.rows[0]);
}));

/**
 * Get all expenses (most recent first)
 */
app.get("/expenses", asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT id, amount, category, created_at
     FROM expenses
     ORDER BY created_at DESC`
    );
    res.json(result.rows);
}));

/**
 * Summary
 */
app.get("/summary", asyncHandler(async (req, res) => {
    const totalResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses`
    );

    const byCategoryResult = await pool.query(
        `SELECT category, SUM(amount) AS total
     FROM expenses
     GROUP BY category`
    );

    res.json({
        total: totalResult.rows[0].total,
        byCategory: byCategoryResult.rows
    });
}));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(4000, () => {
    console.log("Backend running on http://localhost:4000");
});
