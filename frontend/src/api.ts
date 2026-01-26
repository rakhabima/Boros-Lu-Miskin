import type { Expense, InsightResponse, Summary, User } from "./types";

const API_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() || "http://localhost:4000";

const withAuth: RequestInit = {
  credentials: "include"
};

type ApiErrorPayload = {
  error?: string;
  code?: string;
  details?: unknown;
};

type ApiError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function formatApiErrorMessage(
  res: Response,
  payload: ApiErrorPayload | null
) {
  const base = payload?.error || res.statusText || "Request failed";
  const code = payload?.code ? ` (${payload.code})` : "";
  return `${base}${code} (status ${res.status})`;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await readJson<T | ApiErrorPayload>(res);
  if (!res.ok) {
    const payload =
      data && typeof data === "object" ? (data as ApiErrorPayload) : null;
    const error = new Error(formatApiErrorMessage(res, payload)) as ApiError;
    error.status = res.status;
    if (payload?.code) error.code = payload.code;
    if (payload?.details !== undefined) error.details = payload.details;
    throw error;
  }
  if (data === null) {
    throw new Error(`Empty response (status ${res.status})`);
  }
  return data as T;
}

export function getGoogleAuthUrl() {
  return `${API_URL}/auth/google`;
}

export async function signUp({
    email,
    password,
    name
}: {
    email: string;
    password: string;
    name: string;
}): Promise<User> {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
    ...withAuth
  });
  return parseResponse<User>(res);
}

export async function signIn({
    email,
    password
}: {
    email: string;
    password: string;
}): Promise<User> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    ...withAuth
  });
  return parseResponse<User>(res);
}

export async function getCurrentUser(): Promise<User | null> {
  const res = await fetch(`${API_URL}/auth/me`, withAuth);
  if (res.status === 401) return null;
  return parseResponse<User>(res);
}

export async function logout(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    ...withAuth
  });
  return parseResponse<{ ok: boolean }>(res);
}

export async function addExpense(data: {
    amount: number;
    category: string;
    notes: string;
}): Promise<Expense> {
  const res = await fetch(`${API_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    ...withAuth
  });
  return parseResponse<Expense>(res);
}

export async function getExpenses(): Promise<Expense[]> {
  const res = await fetch(`${API_URL}/expenses`, withAuth);
  return parseResponse<Expense[]>(res);
}

export async function deleteExpense(id: number): Promise<Expense> {
  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: "DELETE",
    ...withAuth
  });
  return parseResponse<Expense>(res);
}

export async function updateExpense(
    id: number,
    data: { amount: number; category: string; notes: string }
): Promise<Expense> {
  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    ...withAuth
  });
  return parseResponse<Expense>(res);
}

export async function getSummary(): Promise<Summary> {
  const res = await fetch(`${API_URL}/summary`, withAuth);
  return parseResponse<Summary>(res);
}

export async function getInsights(payload: {
    month: number;
    year: number;
    prompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    isDefault?: boolean;
}): Promise<InsightResponse> {
  const res = await fetch(`${API_URL}/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...withAuth
  });
  return parseResponse<InsightResponse>(res);
}
