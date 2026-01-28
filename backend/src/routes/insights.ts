import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pool } from "../db.js";
import { config } from "../config.js";
import { respondError, respondSuccess } from "../utils/response.js";

export const insightsRouter = Router();

const getMonthRange = (year: number, month: number) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
};

const DAILY_LIMIT = 10;

const defaultPrompt = "give me insights about my expenses";

const fetchSummary = async (
  userId: number,
  start?: Date,
  end?: Date
) => {
  if (start && end) {
    const totalsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [userId, start, end]
    );

    const byCategoryResult = await pool.query(
      `SELECT category, SUM(amount) AS total
       FROM expenses
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY category
       ORDER BY total DESC`,
      [userId, start, end]
    );

    return {
      total: Number(totalsResult.rows[0]?.total || 0),
      categories: byCategoryResult.rows
    };
  }

  const totalsResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE user_id = $1`,
    [userId]
  );

  const byCategoryResult = await pool.query(
    `SELECT category, SUM(amount) AS total
     FROM expenses
     WHERE user_id = $1
     GROUP BY category
     ORDER BY total DESC`,
    [userId]
  );

  return {
    total: Number(totalsResult.rows[0]?.total || 0),
    categories: byCategoryResult.rows
  };
};

insightsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, isDefault } = req.body;
    if (!config.ai.apiKey) {
      return respondError(res, req, {
        status: 500,
        code: "AI_NOT_CONFIGURED",
        message: "AI is not configured on the server",
        details: { provider: "openrouter" },
        authenticated: true
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const usageResult = await pool.query(
      `SELECT count FROM ai_usage WHERE user_id = $1 AND usage_date = $2`,
      [req.user!.id, today]
    );
    const currentCount = usageResult.rows[0]?.count || 0;
    if (!isDefault && currentCount >= DAILY_LIMIT) {
      return respondError(res, req, {
        status: 429,
        code: "AI_RATE_LIMITED",
        message: "Daily AI limit reached",
        details: { limit: DAILY_LIMIT },
        authenticated: true
      });
    }

    const userPrompt = prompt?.trim() || "Give me insights and tips.";
    const defaultMode =
      isDefault ||
      (userPrompt.toLowerCase() === defaultPrompt &&
        (!req.body.messages || req.body.messages.length === 0));

    let total = 0;
    let categories: Array<{ category: string; total: number }> = [];
    let usingGenericAdvice = false;
    let rangeLabel = "current month";

    const now = new Date();
    const current = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const currentSummary = await fetchSummary(
      req.user!.id,
      current.start,
      current.end
    );

    if (currentSummary.total > 0) {
      ({ total, categories } = currentSummary);
      rangeLabel = "current month";
    } else {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonth = getMonthRange(
        lastMonthDate.getFullYear(),
        lastMonthDate.getMonth() + 1
      );
      const lastSummary = await fetchSummary(
        req.user!.id,
        lastMonth.start,
        lastMonth.end
      );

      if (lastSummary.total > 0) {
        ({ total, categories } = lastSummary);
        rangeLabel = "last month";
      } else {
        const allSummary = await fetchSummary(req.user!.id);
        ({ total, categories } = allSummary);
        rangeLabel = "all time";
        if (allSummary.total === 0) {
          usingGenericAdvice = true;
        }
      }
    }
    const messages: Array<{ role?: string; content?: unknown }> = Array.isArray(
      req.body.messages
    )
      ? req.body.messages
      : [];
    const safeMessages = messages
      .filter((msg) => msg && typeof msg.role === "string")
      .slice(-10)
      .map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: String(msg.content || "")
      }));

    const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.ai.apiKey}`,
        "Content-Type": "application/json",
        ...(config.ai.siteUrl ? { "HTTP-Referer": config.ai.siteUrl } : {}),
        ...(config.ai.siteName ? { "X-Title": config.ai.siteName } : {})
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful budgeting coach. Use ONLY the provided spending data. If no expenses exist, give general advice. Keep it concise. Respond in short paragraphs only. Do not use bullet points or numbered lists."
          },
          {
            role: "user",
            content: JSON.stringify({
              range: rangeLabel,
              total,
              categories,
              request: userPrompt,
              fallback: usingGenericAdvice
                ? "No expenses found. Provide general financial advice."
                : undefined
            })
          },
          ...safeMessages
        ],
        temperature: 0.4
      })
    });

    const completion = await response.json();
    if (!response.ok) {
      return respondError(res, req, {
        status: response.status,
        code: "AI_REQUEST_FAILED",
        message: completion.error?.message || "AI request failed",
        details: { status: response.status },
        authenticated: true
      });
    }

    const text = completion.choices?.[0]?.message?.content || "";
    const nextCount = currentCount + (defaultMode ? 0 : 1);
    const remaining = Math.max(0, DAILY_LIMIT - nextCount);

    if (!defaultMode) {
      if (currentCount === 0) {
        await pool.query(
          `INSERT INTO ai_usage (user_id, usage_date, count)
           VALUES ($1, $2, 1)`,
          [req.user!.id, today]
        );
      } else {
        await pool.query(
          `UPDATE ai_usage SET count = count + 1
           WHERE user_id = $1 AND usage_date = $2`,
          [req.user!.id, today]
        );
      }
    }
    return respondSuccess(res, req, {
      code: "AI_INSIGHTS_SUCCESS",
      message: "AI insights generated successfully",
      data: { text, total, categories, remaining },
      authenticated: true
    });
  })
);
