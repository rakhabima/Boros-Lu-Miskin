export type User = {
  id: number;
  google_id: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
};

export type Expense = {
  id: number;
  amount: number;
  category: string;
  notes: string | null;
  created_at: string;
};

export type Summary = {
  total: number;
  byCategory: Array<{ category: string; total: number }>;
};

export type InsightResponse = {
  text: string;
  total: number;
  categories: Array<{ category: string; total: number }>;
  remaining: number | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
