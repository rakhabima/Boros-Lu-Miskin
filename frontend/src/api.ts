import type { Expense, InsightResponse, Summary, User } from "./types";

const API_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() || "http://localhost:4000";

const withAuth: RequestInit = {
  credentials: "include"
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
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
  const base =
    payload?.message || payload?.error || res.statusText || "Request failed";
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

type ApiEnvelope<T> = {
  success: boolean;
  code: string;
  message: string;
  data?: T;
  meta?: {
    request_id?: string;
    timestamp?: string;
    authenticated?: boolean;
  };
};

async function parseEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  return parseResponse<ApiEnvelope<T>>(res);
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
  const envelope = await parseEnvelope<{ user: User }>(res);
  if (!envelope.data?.user) {
    throw new Error("Missing user in signup response");
  }
  return envelope.data.user;
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
  const envelope = await parseEnvelope<{ user: User }>(res);
  if (!envelope.data?.user) {
    throw new Error("Missing user in login response");
  }
  return envelope.data.user;
}

export async function getCurrentUser(): Promise<User | null> {
  const res = await fetch(`${API_URL}/auth/me`, withAuth);
  if (res.status === 401) return null;
  const envelope = await parseEnvelope<{ user: User }>(res);
  return envelope.data?.user ?? null;
}

export async function getExpenses(): Promise<Expense[]> {
  const res = await fetch(`${API_URL}/expenses`, withAuth);
  const envelope = await parseEnvelope<{ expenses: Expense[] }>(res);
  const expenses = envelope.data?.expenses;
  return Array.isArray(expenses) ? expenses : [];
}

export async function getSummary(): Promise<Summary> {
  const res = await fetch(`${API_URL}/summary`, withAuth);
  const envelope = await parseEnvelope<Summary>(res);
  if (!envelope.data) {
    throw new Error("Missing summary response data");
  }
  return envelope.data;
}

export async function getInsights(payload: {
    month: number;
    year: number;
    prompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    isDefault?: boolean;
}): Promise<InsightResponse> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`${API_URL}/insights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf
    },
    body: JSON.stringify(payload),
    ...withAuth
  });
  const envelope = await parseEnvelope<InsightResponse>(res);
  if (!envelope.data) {
    throw new Error("Missing insights response data");
  }
  return envelope.data;
}

// --- Telegram linking helpers ---

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/csrf`, withAuth);
  const data = await parseResponse<{ success: boolean; token: string }>(res);
  if (!data.token) {
    throw new Error("CSRF token missing");
  }
  return data.token;
}

let cachedCsrfToken: string | null = null;
async function ensureCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  cachedCsrfToken = await fetchCsrfToken();
  return cachedCsrfToken;
}

export async function getTelegramStatus(): Promise<{ connected: boolean }> {
  const res = await fetch(`${API_URL}/integrations/telegram/status`, withAuth);
  return parseResponse<{ connected: boolean }>(res);
}

export async function startTelegramLink(
  csrfToken: string
): Promise<{ url: string }> {
  const res = await fetch(`${API_URL}/integrations/telegram/start-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    ...withAuth
  });
  return parseResponse<{ url: string }>(res);
}

// --- CSRF-protected helpers for mutations ---

export async function addExpense(data: {
    amount: number;
    category: string;
    notes: string;
}): Promise<Expense> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`${API_URL}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf
    },
    body: JSON.stringify(data),
    ...withAuth
  });
  const envelope = await parseEnvelope<{ expense: Expense }>(res);
  if (!envelope.data?.expense) {
    throw new Error("Missing expense in create response");
  }
  return envelope.data.expense;
}

export async function deleteExpense(id: number): Promise<Expense> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: "DELETE",
    headers: { "X-CSRF-Token": csrf },
    ...withAuth
  });
  const envelope = await parseEnvelope<{ expense: Expense }>(res);
  if (!envelope.data?.expense) {
    throw new Error("Missing expense in delete response");
  }
  return envelope.data.expense;
}

export async function updateExpense(
    id: number,
    data: { amount: number; category: string; notes: string }
): Promise<Expense> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf
    },
    body: JSON.stringify(data),
    ...withAuth
  });
  const envelope = await parseEnvelope<{ expense: Expense }>(res);
  if (!envelope.data?.expense) {
    throw new Error("Missing expense in update response");
  }
  return envelope.data.expense;
}

export async function logout(): Promise<{ ok: boolean }> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { "X-CSRF-Token": csrf },
    ...withAuth
  });
  const envelope = await parseEnvelope<{ ok: boolean }>(res);
  if (!envelope.data) {
    throw new Error("Missing logout response data");
  }
  return envelope.data;
}
