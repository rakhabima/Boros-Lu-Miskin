export type User = {
  id: number;
  google_id: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
  onboarding_completed_at: string | null;
};

export type Expense = {
  id: number;
  amount: number;
  category: string;
  notes: string | null;
  created_at: string;
  needs_review?: boolean;
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
