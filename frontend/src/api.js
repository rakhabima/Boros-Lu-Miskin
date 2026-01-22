const API_URL = "http://localhost:4000";

const withAuth = {
    credentials: "include"
};

export function getGoogleAuthUrl() {
    return `${API_URL}/auth/google`;
}

export async function signUp({ email, password, name }) {
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
    return data;
}

export async function signIn({ email, password }) {
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
    return data;
}

export async function getCurrentUser() {
    const res = await fetch(`${API_URL}/auth/me`, withAuth);
    if (!res.ok) return null;
    return res.json();
}

export async function logout() {
    const res = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        ...withAuth
    });
    return res.json();
}

export async function addExpense(data) {
    const res = await fetch(`${API_URL}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        ...withAuth
    });
    return res.json();
}

export async function getExpenses() {
    const res = await fetch(`${API_URL}/expenses`, withAuth);
    return res.json();
}

export async function deleteExpense(id) {
    const res = await fetch(`${API_URL}/expenses/${id}`, {
        method: "DELETE",
        ...withAuth
    });
    return res.json();
}

export async function getSummary() {
    const res = await fetch(`${API_URL}/summary`, withAuth);
    return res.json();
}
