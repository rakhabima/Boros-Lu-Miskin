import type { Expense } from "@/types";

export function formatIDR(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(value);
}

export const CATEGORIES = [
  "All",
  "Food",
  "Transport",
  "Shopping",
  "Subscription",
  "Other"
];

export const RANGE_PRESETS = ["Last 7 days", "Last 30 days", "Last 365 days"];

export const PAGE_SIZE = 10;

export function filterExpenses(
  expenses: Expense[],
  category: string,
  range: string
): Expense[] {
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);

  if (range === "Last 7 days") {
    rangeStart.setDate(now.getDate() - 6);
  } else if (range === "Last 30 days") {
    rangeStart.setDate(now.getDate() - 29);
  } else {
    rangeStart.setFullYear(now.getFullYear() - 1);
  }

  return expenses.filter((e) => {
    if (category !== "All" && e.category !== category) return false;
    if (new Date(e.created_at) < rangeStart) return false;
    return true;
  });
}

export function monthSummary(expenses: Expense[]) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const byCategory = new Map<string, number>();
  let total = 0;

  for (const e of expenses) {
    const d = new Date(e.created_at);
    if (d.getMonth() !== month || d.getFullYear() !== year) continue;
    total += Number(e.amount || 0);
    byCategory.set(e.category, (byCategory.get(e.category) || 0) + Number(e.amount));
  }

  return {
    total,
    byCategory: Array.from(byCategory.entries()).map(([category, t]) => ({
      category,
      total: t
    }))
  };
}
