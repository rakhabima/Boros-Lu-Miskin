import { pool } from "./db";
import { config } from "./config";

const getMonthRange = (year: number, month: number) => ({
  start: new Date(year, month - 1, 1),
  end: new Date(year, month, 1)
});

async function fetchSummary(userId: number, start?: Date, end?: Date) {
  const bounded = start && end;
  const where = bounded
    ? `user_id = $1 AND created_at >= $2 AND created_at < $3`
    : `user_id = $1`;
  const args = bounded ? [userId, start, end] : [userId];

  const totals = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE ${where}`,
    args
  );
  const byCategory = await pool.query(
    `SELECT category, SUM(amount) AS total FROM expenses WHERE ${where}
     GROUP BY category ORDER BY total DESC`,
    args
  );

  return {
    total: Number(totals.rows[0]?.total || 0),
    categories: byCategory.rows
  };
}

export async function resolveSummary(userId: number) {
  const now = new Date();
  const current = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const currentSummary = await fetchSummary(userId, current.start, current.end);
  if (currentSummary.total > 0) {
    return { ...currentSummary, rangeLabel: "current month", generic: false };
  }

  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = getMonthRange(lastDate.getFullYear(), lastDate.getMonth() + 1);
  const lastSummary = await fetchSummary(userId, last.start, last.end);
  if (lastSummary.total > 0) {
    return { ...lastSummary, rangeLabel: "last month", generic: false };
  }

  const allSummary = await fetchSummary(userId);
  return {
    ...allSummary,
    rangeLabel: "all time",
    generic: allSummary.total === 0
  };
}

export async function callOpenRouter(
  summary: Awaited<ReturnType<typeof resolveSummary>>,
  userPrompt: string,
  history: Array<{ role: string; content: string }>
): Promise<{ text: string } | { error: string }> {
  const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: "POST",
    // Approved fix 2. Without this a hung upstream pins the serverless function
    // to its ceiling and burns quota.
    signal: AbortSignal.timeout(20_000),
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
            range: summary.rangeLabel,
            total: summary.total,
            categories: summary.categories,
            request: userPrompt,
            fallback: summary.generic
              ? "No expenses found. Provide general financial advice."
              : undefined
          })
        },
        ...history
      ],
      temperature: 0.4
    })
  });

  const completion = await response.json();
  if (!response.ok) {
    return { error: completion.error?.message || "AI request failed" };
  }
  return { text: completion.choices?.[0]?.message?.content || "" };
}
