import type { Expense, InsightResponse, Summary, User } from "./types";

const API_URL = "http://localhost:4000";

const withAuth: RequestInit = {
    credentials: "include"
};

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
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Sign up failed");
    }
    return data as User;
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
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Sign in failed");
    }
    return data as User;
}

export async function getCurrentUser(): Promise<User | null> {
    const res = await fetch(`${API_URL}/auth/me`, withAuth);
    if (!res.ok) return null;
    return res.json();
}

export async function logout(): Promise<{ ok: boolean }> {
    const res = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        ...withAuth
    });
    return res.json();
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
    return res.json();
}

export async function getExpenses(): Promise<Expense[]> {
    const res = await fetch(`${API_URL}/expenses`, withAuth);
    return res.json();
}

export async function deleteExpense(id: number): Promise<Expense> {
    const res = await fetch(`${API_URL}/expenses/${id}`, {
        method: "DELETE",
        ...withAuth
    });
    return res.json();
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
    return res.json();
}

export async function getSummary(): Promise<Summary> {
    const res = await fetch(`${API_URL}/summary`, withAuth);
    return res.json();
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
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed to get insights");
    }
    return data as InsightResponse;
}
